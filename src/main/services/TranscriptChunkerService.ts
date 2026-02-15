import { createLogger } from '../core/logger';
import type { TranscriptSegment, TranscriptChunk } from '@shared/types';
import { randomUUID } from 'crypto';

const logger = createLogger('TranscriptChunkerService');

// Token estimation: ~4 characters per token for English text
// This is a rough estimate; for production, consider using tiktoken
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

interface ChunkerConfig {
  targetMinTokens: number;  // 400
  targetMaxTokens: number;  // 800
  hardMaxTokens: number;    // 1000
  minChunkTokens: number;   // 150
  maxTimeGapMs: number;     // 2-3 minutes in milliseconds
}

const DEFAULT_CONFIG: ChunkerConfig = {
  targetMinTokens: 400,
  targetMaxTokens: 800,
  hardMaxTokens: 1000,
  minChunkTokens: 150,
  maxTimeGapMs: 180000, // 3 minutes
};

export class TranscriptChunkerService {
  private config: ChunkerConfig;

  constructor(config?: Partial<ChunkerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Chunks transcript segments into semantic chunks of 400-800 tokens
   * @param segments - Array of transcript segments sorted by timestamp
   * @param meetingId - Meeting ID for the chunks
   * @returns Array of transcript chunks
   */
  public chunkTranscript(
    segments: TranscriptSegment[],
    meetingId: string
  ): TranscriptChunk[] {
    if (segments.length === 0) {
      return [];
    }

    // Sort segments by timestamp to ensure chronological order
    const sortedSegments = [...segments].sort((a, b) => a.timestamp - b.timestamp);

    const chunks: TranscriptChunk[] = [];
    let currentChunk: {
      segments: TranscriptSegment[];
      text: string;
      tokenCount: number;
      startTime: number;
      endTime: number;
      speakerSet: Set<string>;
    } | null = null;

    for (const segment of sortedSegments) {
      const segmentTokens = estimateTokenCount(segment.text);
      const speaker = this.getSpeakerLabel(segment);

      // Initialize first chunk
      if (!currentChunk) {
        currentChunk = {
          segments: [segment],
          text: segment.text,
          tokenCount: segmentTokens,
          startTime: segment.timestamp,
          endTime: segment.timestamp,
          speakerSet: new Set([speaker]),
        };
        continue;
      }

      // Check if we should start a new chunk
      const timeGap = segment.timestamp - currentChunk.endTime;
      const wouldExceedHardMax =
        currentChunk.tokenCount + segmentTokens > this.config.hardMaxTokens;
      const hasLargeTimeGap = timeGap > this.config.maxTimeGapMs;
      const reachedTarget = currentChunk.tokenCount >= this.config.targetMinTokens;

      if ((wouldExceedHardMax || hasLargeTimeGap) && reachedTarget) {
        // Finalize current chunk
        chunks.push(this.finalizeChunk(currentChunk, meetingId));

        // Start new chunk
        currentChunk = {
          segments: [segment],
          text: segment.text,
          tokenCount: segmentTokens,
          startTime: segment.timestamp,
          endTime: segment.timestamp,
          speakerSet: new Set([speaker]),
        };
      } else {
        // Add to current chunk
        currentChunk.segments.push(segment);
        currentChunk.text += ' ' + segment.text;
        currentChunk.tokenCount += segmentTokens;
        currentChunk.endTime = segment.timestamp;
        currentChunk.speakerSet.add(speaker);
      }
    }

    // Finalize the last chunk
    if (currentChunk) {
      chunks.push(this.finalizeChunk(currentChunk, meetingId));
    }

    // Post-process: merge tiny chunks with neighbors
    const mergedChunks = this.mergeTinyChunks(chunks, meetingId);

    logger.info('Chunked transcript', {
      meetingId,
      segmentCount: segments.length,
      chunkCount: mergedChunks.length,
      avgTokensPerChunk: Math.round(
        mergedChunks.reduce((sum, c) => sum + c.tokenCount, 0) / mergedChunks.length
      ),
    });

    return mergedChunks;
  }

  /**
   * Get speaker label from segment
   */
  private getSpeakerLabel(segment: TranscriptSegment): string {
    if (segment.speakerId) {
      return segment.speakerId;
    }
    return segment.source === 'mic' ? 'You' : 'Other';
  }

  /**
   * Finalize a chunk and convert to TranscriptChunk
   */
  private finalizeChunk(
    chunk: {
      segments: TranscriptSegment[];
      text: string;
      tokenCount: number;
      startTime: number;
      endTime: number;
      speakerSet: Set<string>;
    },
    meetingId: string
  ): TranscriptChunk {
    return {
      id: randomUUID(),
      meetingId,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      text: chunk.text.trim(),
      tokenCount: chunk.tokenCount,
      segmentIds: chunk.segments.map((s) => s.id),
      speakerSet: Array.from(chunk.speakerSet),
      createdAt: new Date(),
    };
  }

  /**
   * Merge chunks smaller than minChunkTokens with their neighbors
   */
  private mergeTinyChunks(chunks: TranscriptChunk[], meetingId: string): TranscriptChunk[] {
    if (chunks.length <= 1) {
      return chunks;
    }

    const result: TranscriptChunk[] = [];
    let i = 0;

    while (i < chunks.length) {
      const currentChunk = chunks[i];

      // If this chunk is tiny and not the last one, try to merge with next
      if (
        currentChunk.tokenCount < this.config.minChunkTokens &&
        i < chunks.length - 1
      ) {
        const nextChunk = chunks[i + 1];
        const mergedTokenCount = currentChunk.tokenCount + nextChunk.tokenCount;

        // Only merge if the combined size doesn't exceed hard max
        if (mergedTokenCount <= this.config.hardMaxTokens) {
          const merged: TranscriptChunk = {
            id: randomUUID(),
            meetingId,
            startTime: currentChunk.startTime,
            endTime: nextChunk.endTime,
            text: currentChunk.text + ' ' + nextChunk.text,
            tokenCount: mergedTokenCount,
            segmentIds: [...currentChunk.segmentIds, ...nextChunk.segmentIds],
            speakerSet: Array.from(
              new Set([...currentChunk.speakerSet, ...nextChunk.speakerSet])
            ),
            createdAt: new Date(),
          };

          result.push(merged);
          i += 2; // Skip both chunks
          continue;
        }
      }

      // Otherwise, keep the chunk as-is
      result.push(currentChunk);
      i++;
    }

    return result;
  }

  /**
   * Process a meeting's transcript and return chunks
   * This is the main entry point for chunking
   */
  public async processTranscript(
    meetingId: string,
    segments: TranscriptSegment[]
  ): Promise<TranscriptChunk[]> {
    try {
      const chunks = this.chunkTranscript(segments, meetingId);
      return chunks;
    } catch (error) {
      logger.error('Failed to chunk transcript', { meetingId, error });
      throw error;
    }
  }
}

// Export singleton instance
export const transcriptChunker = new TranscriptChunkerService();

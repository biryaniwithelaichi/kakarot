import { createLogger } from '../core/logger';
import { getContainer } from '../core/container';
import { getDatabase, saveDatabase } from '../data/database';
import { transcriptChunker } from './TranscriptChunkerService';
import { embeddingService } from './EmbeddingService';
import { semanticSearchService } from './SemanticSearchService';
import {
  createZoomPrompt,
  shouldSummarize,
  MODEL_VERSION,
  PROMPT_VERSION,
} from '../prompts/deepDivePrompts';
import type {
  TranscriptSegment,
  EnhancedDeepDiveResult,
  DeepDiveCacheEntry,
  TranscriptChunk,
} from '@shared/types';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';

const logger = createLogger('EnhancedDeepDiveService');

export class EnhancedDeepDiveService {
  /**
   * Generate hash for note block text (for cache key)
   */
  private hashNoteBlock(noteText: string): string {
    return createHash('sha256').update(noteText.trim().toLowerCase()).digest('hex');
  }

  /**
   * Format timestamp from milliseconds to HH:MM:SS
   */
  private formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  /**
   * Check cache for existing deep dive result
   */
  private async checkCache(
    meetingId: string,
    noteBlockHash: string
  ): Promise<EnhancedDeepDiveResult | null> {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM deep_dive_cache
        WHERE meeting_id = ?
          AND note_block_hash = ?
          AND model_version = ?
          AND prompt_version = ?
        ORDER BY created_at DESC
        LIMIT 1
      `);

      stmt.bind([meetingId, noteBlockHash, MODEL_VERSION, PROMPT_VERSION]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        const summaryJson = JSON.parse(row.summary_json as string);

        logger.info('Cache hit for deep dive', {
          meetingId,
          noteBlockHash: noteBlockHash.substring(0, 8),
          cachedAt: new Date(row.created_at as number),
        });

        stmt.free();
        return summaryJson as EnhancedDeepDiveResult;
      }

      stmt.free();
      return null;
    } catch (error) {
      logger.error('Failed to check cache', { meetingId, error });
      return null;
    }
  }

  /**
   * Store deep dive result in cache
   */
  private async storeCache(
    meetingId: string,
    noteBlockHash: string,
    chunkIds: string[],
    result: EnhancedDeepDiveResult
  ): Promise<void> {
    const db = getDatabase();

    try {
      const now = Date.now();
      const cacheId = randomUUID();

      const stmt = db.prepare(`
        INSERT INTO deep_dive_cache (
          id, meeting_id, note_block_hash, chunk_ids,
          model_version, prompt_version, summary_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        cacheId,
        meetingId,
        noteBlockHash,
        JSON.stringify(chunkIds),
        MODEL_VERSION,
        PROMPT_VERSION,
        JSON.stringify(result),
        now,
        now,
      ]);

      stmt.free();
      saveDatabase();

      logger.info('Stored deep dive in cache', {
        meetingId,
        noteBlockHash: noteBlockHash.substring(0, 8),
      });
    } catch (error) {
      logger.error('Failed to store cache', { meetingId, error });
      // Don't throw - caching is optional
    }
  }

  /**
   * Ensure chunks exist for this meeting
   */
  private async ensureChunksExist(
    meetingId: string,
    transcript: TranscriptSegment[]
  ): Promise<void> {
    const db = getDatabase();

    // Check if chunks already exist
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM transcript_chunks WHERE meeting_id = ?
    `);
    stmt.bind([meetingId]);

    let chunkCount = 0;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      chunkCount = row.count as number;
    }
    stmt.free();

    if (chunkCount > 0) {
      logger.debug('Chunks already exist for meeting', { meetingId, chunkCount });
      return;
    }

    // Generate chunks
    logger.info('Generating chunks for meeting', { meetingId });
    const chunks = await transcriptChunker.processTranscript(meetingId, transcript);

    // Try to generate embeddings, but continue without them if it fails
    try {
      logger.info('Generating embeddings for chunks', {
        meetingId,
        chunkCount: chunks.length,
      });
      await embeddingService.processMeetingEmbeddings(meetingId, chunks);
      logger.info('Chunks and embeddings ready', { meetingId, chunkCount: chunks.length });
    } catch (error) {
      logger.warn('Failed to generate embeddings, will use keyword search fallback', {
        meetingId,
        error,
      });
      // Store chunks without embeddings for keyword search
      await this.storeChunksWithoutEmbeddings(chunks);
    }
  }

  /**
   * Store chunks without embeddings (fallback for when embedding service is unavailable)
   */
  private async storeChunksWithoutEmbeddings(chunks: TranscriptChunk[]): Promise<void> {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT INTO transcript_chunks (
          id, meeting_id, start_time, end_time, text,
          token_count, segment_ids, speaker_set, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `);

      for (const chunk of chunks) {
        stmt.run([
          chunk.id,
          chunk.meetingId,
          chunk.startTime,
          chunk.endTime,
          chunk.text,
          chunk.tokenCount,
          JSON.stringify(chunk.segmentIds),
          JSON.stringify(chunk.speakerSet),
          chunk.createdAt.getTime(),
        ]);
      }

      stmt.free();
      saveDatabase();

      logger.info('Stored chunks without embeddings', { chunkCount: chunks.length });
    } catch (error) {
      logger.error('Failed to store chunks without embeddings', { error });
      throw error;
    }
  }

  /**
   * Perform enhanced deep dive with semantic search and smart summarization
   */
  async performDeepDive(
    meetingId: string,
    noteBlockText: string,
    transcript: TranscriptSegment[]
  ): Promise<EnhancedDeepDiveResult> {
    const noteBlockHash = this.hashNoteBlock(noteBlockText);

    // Check cache first
    const cached = await this.checkCache(meetingId, noteBlockHash);
    if (cached) {
      return cached;
    }

    // Ensure chunks and embeddings exist
    await this.ensureChunksExist(meetingId, transcript);

    // Perform semantic search
    logger.info('Starting semantic search', { meetingId });
    const searchResult = await semanticSearchService.searchAndCombine(
      noteBlockText,
      meetingId
    );

    const { chunks, combinedText, totalTokens } = searchResult;

    logger.info('Semantic search completed', {
      meetingId,
      chunkCount: chunks.length,
      totalTokens,
    });

    // Decide: raw transcript or summary?
    const needsSummary = shouldSummarize(totalTokens, chunks.length);

    if (!needsSummary) {
      // Return raw transcript
      logger.info('Returning raw transcript (below threshold)', {
        meetingId,
        totalTokens,
      });

      // Convert chunks to transcript segments
      const transcriptSlice = transcript.filter((segment) =>
        chunks.some((chunk) => chunk.segmentIds.includes(segment.id))
      );

      const result: EnhancedDeepDiveResult = {
        summary: 'This section is short; showing raw transcript.',
        keyPoints: [],
        notableQuotes: [],
        transcriptSlice,
        totalTokens,
        isRawTranscript: true,
      };

      // Cache result
      await this.storeCache(
        meetingId,
        noteBlockHash,
        chunks.map((c) => c.id),
        result
      );

      return result;
    }

    // Generate summary
    logger.info('Generating summary', { meetingId, totalTokens });

    const { aiProvider } = getContainer();
    if (!aiProvider) {
      throw new Error('AI provider not configured');
    }

    // Extract speakers
    const speakers = Array.from(
      new Set(chunks.flatMap((chunk) => chunk.speakerSet))
    );

    // Format transcript with timestamps
    const formattedTranscript = chunks
      .map((chunk) => {
        const timestamp = this.formatTimestamp(chunk.startTime);
        const speakerPrefix = chunk.speakerSet.length > 0 ? `[${chunk.speakerSet.join(', ')}]` : '';
        return `${timestamp} ${speakerPrefix}\n${chunk.text}`;
      })
      .join('\n\n');

    const prompt = createZoomPrompt({
      noteBlockText,
      transcriptSlice: formattedTranscript,
      speakers,
    });

    try {
      const response = await aiProvider.complete(prompt, MODEL_VERSION);

      // Parse JSON response
      const cleaned = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      // Convert chunks to transcript segments for transcript tab
      const transcriptSlice = transcript.filter((segment) =>
        chunks.some((chunk) => chunk.segmentIds.includes(segment.id))
      );

      const result: EnhancedDeepDiveResult = {
        summary: parsed.summary || '',
        keyPoints: parsed.keyPoints || [],
        notableQuotes: parsed.notableQuotes || [],
        transcriptSlice,
        totalTokens,
        isRawTranscript: false,
      };

      // Cache result
      await this.storeCache(
        meetingId,
        noteBlockHash,
        chunks.map((c) => c.id),
        result
      );

      return result;
    } catch (error) {
      logger.error('Failed to generate summary', { meetingId, error });

      // Fallback: return raw transcript
      const transcriptSlice = transcript.filter((segment) =>
        chunks.some((chunk) => chunk.segmentIds.includes(segment.id))
      );

      return {
        summary: 'Summary generation failed. Showing raw transcript.',
        keyPoints: [],
        notableQuotes: [],
        transcriptSlice,
        totalTokens,
        isRawTranscript: true,
      };
    }
  }
}

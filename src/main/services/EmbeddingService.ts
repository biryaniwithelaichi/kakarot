import { createLogger } from '../core/logger';
import { getBackendAPI } from '../providers/BackendAPIProvider';
import { getDatabase, saveDatabase } from '../data/database';
import type { TranscriptChunk } from '@shared/types';

const logger = createLogger('EmbeddingService');

const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 100; // Process 100 chunks at a time

export class EmbeddingService {
  /**
   * Generate embedding for a single text input
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const backendAPI = getBackendAPI();
      const response = await backendAPI.embedding({
        input: text,
        model: EMBEDDING_MODEL,
      });

      if (response.data.length === 0) {
        throw new Error('No embedding returned from API');
      }

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Failed to generate embedding', { error });
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple text inputs in batch
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const backendAPI = getBackendAPI();
      const response = await backendAPI.embedding({
        input: texts,
        model: EMBEDDING_MODEL,
      });

      // Sort by index to ensure correct order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch (error) {
      logger.error('Failed to generate embeddings batch', {
        error,
        textCount: texts.length,
      });
      throw error;
    }
  }

  /**
   * Serialize embedding array to BLOB for SQLite storage
   */
  private serializeEmbedding(embedding: number[]): Uint8Array {
    // Convert float64 array to bytes
    const buffer = new Float32Array(embedding);
    return new Uint8Array(buffer.buffer);
  }

  /**
   * Deserialize embedding from BLOB
   */
  private deserializeEmbedding(blob: Uint8Array): number[] {
    const buffer = new Float32Array(
      blob.buffer,
      blob.byteOffset,
      blob.byteLength / 4
    );
    return Array.from(buffer);
  }

  /**
   * Store chunk embeddings in database
   */
  async storeChunkEmbeddings(chunks: TranscriptChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const db = getDatabase();

    try {
      // Process in batches to avoid overwhelming the API
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map((chunk) => chunk.text);

        logger.info('Generating embeddings for batch', {
          batchStart: i,
          batchSize: batch.length,
          totalChunks: chunks.length,
        });

        // Generate embeddings
        const embeddings = await this.generateEmbeddingsBatch(texts);

        // Store in database
        const stmt = db.prepare(`
          INSERT INTO transcript_chunks (
            id, meeting_id, start_time, end_time, text,
            embedding_blob, token_count, segment_ids, speaker_set, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            embedding_blob = excluded.embedding_blob,
            updated_at = ?
        `);

        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j];
          const embeddingBlob = this.serializeEmbedding(embedding);
          const now = Date.now();

          stmt.run([
            chunk.id,
            chunk.meetingId,
            chunk.startTime,
            chunk.endTime,
            chunk.text,
            embeddingBlob,
            chunk.tokenCount,
            JSON.stringify(chunk.segmentIds),
            JSON.stringify(chunk.speakerSet),
            chunk.createdAt.getTime(),
            now,
          ]);
        }

        stmt.free();
        saveDatabase();

        logger.info('Stored embeddings for batch', {
          batchStart: i,
          batchSize: batch.length,
        });
      }

      logger.info('All chunk embeddings stored', { totalChunks: chunks.length });
    } catch (error) {
      logger.error('Failed to store chunk embeddings', { error });
      throw error;
    }
  }

  /**
   * Get chunks with embeddings for a meeting
   */
  async getChunksWithEmbeddings(meetingId: string): Promise<TranscriptChunk[]> {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM transcript_chunks
        WHERE meeting_id = ?
        ORDER BY start_time ASC
      `);

      stmt.bind([meetingId]);

      const chunks: TranscriptChunk[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const embeddingBlob = row.embedding_blob as Uint8Array;

        chunks.push({
          id: row.id as string,
          meetingId: row.meeting_id as string,
          startTime: row.start_time as number,
          endTime: row.end_time as number,
          text: row.text as string,
          tokenCount: row.token_count as number,
          segmentIds: JSON.parse(row.segment_ids as string),
          speakerSet: JSON.parse(row.speaker_set as string),
          embedding: embeddingBlob ? this.deserializeEmbedding(embeddingBlob) : undefined,
          createdAt: new Date(row.created_at as number),
        });
      }

      stmt.free();

      logger.debug('Retrieved chunks with embeddings', {
        meetingId,
        chunkCount: chunks.length,
      });

      return chunks;
    } catch (error) {
      logger.error('Failed to get chunks with embeddings', { meetingId, error });
      throw error;
    }
  }

  /**
   * Process a meeting: chunk transcript and generate embeddings
   */
  async processMeetingEmbeddings(
    meetingId: string,
    chunks: TranscriptChunk[]
  ): Promise<void> {
    try {
      logger.info('Processing meeting embeddings', {
        meetingId,
        chunkCount: chunks.length,
      });

      await this.storeChunkEmbeddings(chunks);

      logger.info('Meeting embeddings processed successfully', {
        meetingId,
        chunkCount: chunks.length,
      });
    } catch (error) {
      logger.error('Failed to process meeting embeddings', { meetingId, error });
      throw error;
    }
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();

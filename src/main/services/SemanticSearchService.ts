import { createLogger } from '../core/logger';
import { embeddingService } from './EmbeddingService';
import type { TranscriptChunk } from '@shared/types';

const logger = createLogger('SemanticSearchService');

interface ScoredChunk extends TranscriptChunk {
  similarityScore: number;
}

export class SemanticSearchService {
  private readonly TOP_K = 5; // Return top 5 most relevant chunks
  private readonly MIN_SIMILARITY_THRESHOLD = 0.3; // Minimum cosine similarity to consider relevant

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Search for relevant transcript chunks using semantic search
   */
  async searchRelevantChunks(
    noteText: string,
    meetingId: string,
    topK: number = this.TOP_K
  ): Promise<TranscriptChunk[]> {
    try {
      logger.debug('Starting semantic search', {
        meetingId,
        noteLength: noteText.length,
        topK,
      });

      // Get all chunks for this meeting
      const chunks = await embeddingService.getChunksWithEmbeddings(meetingId);

      if (chunks.length === 0) {
        logger.warn('No chunks found for meeting', { meetingId });
        return [];
      }

      // Check if chunks have embeddings
      const chunksWithEmbeddings = chunks.filter(
        (chunk) => chunk.embedding && chunk.embedding.length > 0
      );

      // If no embeddings available, fall back to keyword search immediately
      if (chunksWithEmbeddings.length === 0) {
        logger.info('No embeddings available, using keyword search fallback', {
          meetingId,
        });
        return this.keywordSearch(noteText, chunks, topK);
      }

      // Try to generate embedding for the note text
      let noteEmbedding: number[];
      try {
        noteEmbedding = await embeddingService.generateEmbedding(noteText);
      } catch (error) {
        logger.warn('Failed to generate note embedding, falling back to keyword search', {
          meetingId,
          error,
        });
        return this.keywordSearch(noteText, chunks, topK);
      }

      // Calculate similarity scores
      const scoredChunks: ScoredChunk[] = chunksWithEmbeddings.map((chunk) => ({
        ...chunk,
        similarityScore: this.cosineSimilarity(noteEmbedding, chunk.embedding!),
      }));

      // Sort by similarity score (descending) and take top K
      scoredChunks.sort((a, b) => b.similarityScore - a.similarityScore);
      const topChunks = scoredChunks.slice(0, topK);

      // Check if top results meet minimum threshold
      const relevantChunks = topChunks.filter(
        (chunk) => chunk.similarityScore >= this.MIN_SIMILARITY_THRESHOLD
      );

      if (relevantChunks.length === 0) {
        logger.warn('No chunks met similarity threshold', {
          meetingId,
          threshold: this.MIN_SIMILARITY_THRESHOLD,
          topScore: topChunks[0]?.similarityScore,
        });

        // Fallback: use keyword search
        return this.keywordSearch(noteText, chunks, topK);
      }

      // Sort by start_time for chronological reading
      relevantChunks.sort((a, b) => a.startTime - b.startTime);

      logger.info('Semantic search completed', {
        meetingId,
        totalChunks: chunks.length,
        relevantChunks: relevantChunks.length,
        avgScore: (
          relevantChunks.reduce((sum, c) => sum + c.similarityScore, 0) /
          relevantChunks.length
        ).toFixed(3),
        topScore: relevantChunks[0]?.similarityScore.toFixed(3),
      });

      return relevantChunks;
    } catch (error) {
      logger.error('Semantic search failed', { meetingId, error });
      throw error;
    }
  }

  /**
   * Fallback keyword search when semantic search returns low scores
   */
  private keywordSearch(
    noteText: string,
    chunks: TranscriptChunk[],
    topK: number
  ): TranscriptChunk[] {
    logger.info('Falling back to keyword search');

    // Extract keywords from note text (simple word tokenization)
    const keywords = noteText
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3); // Filter out short words

    if (keywords.length === 0) {
      // If no keywords, return first few chunks chronologically
      return chunks.slice(0, topK);
    }

    // Score chunks by keyword matches
    const scoredChunks = chunks.map((chunk) => {
      const chunkTextLower = chunk.text.toLowerCase();
      const matchCount = keywords.reduce((count, keyword) => {
        return count + (chunkTextLower.includes(keyword) ? 1 : 0);
      }, 0);

      return {
        ...chunk,
        score: matchCount,
      };
    });

    // Sort by match count and take top K
    scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = scoredChunks.slice(0, topK).filter((c) => c.score > 0);

    // Sort by start_time for chronological reading
    topChunks.sort((a, b) => a.startTime - b.startTime);

    logger.info('Keyword search completed', {
      totalChunks: chunks.length,
      matchedChunks: topChunks.length,
      keywords: keywords.length,
    });

    return topChunks;
  }

  /**
   * Search and combine chunks into a single text slice
   */
  async searchAndCombine(
    noteText: string,
    meetingId: string,
    topK: number = this.TOP_K
  ): Promise<{
    chunks: TranscriptChunk[];
    combinedText: string;
    totalTokens: number;
  }> {
    const chunks = await this.searchRelevantChunks(noteText, meetingId, topK);

    const combinedText = chunks.map((chunk) => chunk.text).join(' ');
    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);

    return {
      chunks,
      combinedText,
      totalTokens,
    };
  }

  /**
   * Get all chunks for a meeting sorted chronologically
   * Used when semantic search is not available or needed
   */
  async getAllChunksChronological(meetingId: string): Promise<TranscriptChunk[]> {
    try {
      const chunks = await embeddingService.getChunksWithEmbeddings(meetingId);
      chunks.sort((a, b) => a.startTime - b.startTime);
      return chunks;
    } catch (error) {
      logger.error('Failed to get chronological chunks', { meetingId, error });
      throw error;
    }
  }
}

// Export singleton instance
export const semanticSearchService = new SemanticSearchService();

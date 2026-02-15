import { createLogger } from '../core/logger';

const logger = createLogger('BackendAPI');

export const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'https://treeto-api-539354053948.asia-south1.run.app';

export interface BackendConfig {
  features: {
    transcription: boolean;
    ai: boolean;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: 'json' | { type: 'json_object' };
}

export interface ChatResponse {
  id?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface TranscribeRequest {
  audio: string; // Base64 encoded audio data
  encoding?: string;
  sampleRate?: number;
  channels?: number;
  language?: string;
}

export interface TranscribeResponse {
  transcript: string;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  confidence?: number;
}

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Centralized provider for communicating with the Treeto backend API.
 * All API calls are routed through this provider to ensure consistent
 * error handling and authentication.
 */
export class BackendAPIProvider {
  private baseUrl: string;

  constructor(baseUrl: string = BACKEND_BASE_URL) {
    this.baseUrl = baseUrl;
    logger.info('Backend API provider initialized', { baseUrl: this.baseUrl });
  }

  /**
   * Fetch configuration from the backend.
   * Used to determine which features are enabled.
   */
  async fetchConfig(): Promise<BackendConfig> {
    const url = `${this.baseUrl}/api/config`;
    logger.debug('Fetching config', { url });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Config fetch failed', { status: response.status, error: errorText });
        throw new Error(`Config fetch failed: ${response.status} ${errorText}`);
      }

      const config = await response.json() as BackendConfig;
      logger.info('Config fetched successfully', { features: config.features });
      return config;
    } catch (error) {
      logger.error('Config fetch error', error as Error);
      // Return default config if fetch fails
      return {
        features: {
          transcription: false,
          ai: false,
        },
      };
    }
  }

  /**
   * Send a chat request to the backend AI endpoint.
   * The backend handles routing to the appropriate AI provider (Gemini/OpenAI).
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const url = `${this.baseUrl}/api/chat`;
    logger.debug('Sending chat request', { url });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Chat request failed', { status: response.status, error: errorText });
        throw new Error(`Chat API error: ${response.status} ${errorText}`);
      }

      const result = await response.json() as ChatResponse;
      logger.debug('Chat response received', {
        promptTokens: result.usage?.prompt_tokens,
        outputTokens: result.usage?.completion_tokens,
      });
      return result;
    } catch (error) {
      logger.error('Chat request error', error as Error);
      throw error;
    }
  }

  /**
   * Send audio data to the backend for transcription.
   * The backend handles routing to the appropriate transcription provider.
   */
  async transcribe(request: TranscribeRequest): Promise<TranscribeResponse> {
    const url = `${this.baseUrl}/api/transcribe`;
    logger.debug('Sending transcribe request', {
      url,
      audioLength: request.audio.length,
      encoding: request.encoding,
      sampleRate: request.sampleRate,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Transcribe request failed', { status: response.status, error: errorText });
        throw new Error(`Transcribe API error: ${response.status} ${errorText}`);
      }

      const result = await response.json() as TranscribeResponse;
      logger.debug('Transcribe response received', {
        transcriptLength: result.transcript.length,
        wordCount: result.words?.length,
      });
      return result;
    } catch (error) {
      logger.error('Transcribe request error', error as Error);
      throw error;
    }
  }

  /**
   * Generate embeddings for text input.
   * The backend handles routing to the appropriate embedding model.
   */
  async embedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const url = `${this.baseUrl}/api/embeddings`;
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    logger.debug('Sending embedding request', {
      url,
      model: request.model || 'text-embedding-3-small',
      inputCount: inputs.length,
      totalChars: inputs.reduce((sum, text) => sum + text.length, 0),
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: request.input,
          model: request.model || 'text-embedding-3-small',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Embedding request failed', { status: response.status, error: errorText });
        throw new Error(`Embedding API error: ${response.status} ${errorText}`);
      }

      const result = await response.json() as EmbeddingResponse;
      logger.debug('Embedding response received', {
        embeddingCount: result.data.length,
        dimensions: result.data[0]?.embedding.length,
        tokens: result.usage?.total_tokens,
      });
      return result;
    } catch (error) {
      logger.error('Embedding request error', error as Error);
      throw error;
    }
  }
}

// Singleton instance
let backendAPIInstance: BackendAPIProvider | null = null;

export function getBackendAPI(): BackendAPIProvider {
  if (!backendAPIInstance) {
    backendAPIInstance = new BackendAPIProvider();
  }
  return backendAPIInstance;
}

export function initializeBackendAPI(baseUrl?: string): BackendAPIProvider {
  backendAPIInstance = new BackendAPIProvider(baseUrl);
  return backendAPIInstance;
}

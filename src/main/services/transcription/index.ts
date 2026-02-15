export type { ITranscriptionProvider, TranscriptCallback } from './TranscriptionProvider';
export { BaseDualStreamProvider } from './BaseDualStreamProvider';
export { AssemblyAIProvider } from './AssemblyAIProvider';
export { DeepgramProvider } from './DeepgramProvider';
export type { DeepgramProviderOptions } from './DeepgramProvider';
export { BackendTranscriptionProvider } from './BackendTranscriptionProvider';

import type { ITranscriptionProvider } from './TranscriptionProvider';
import { DeepgramProvider } from './DeepgramProvider';
import { createLogger } from '../../core/logger';

const logger = createLogger('TranscriptionFactory');

export interface TranscriptionProviderOptions {
  /** JWT token from backend (preferred - keeps API key secure on server) */
  token?: string;
  /** Direct API key (legacy - less secure, key stored locally) */
  apiKey?: string;
}

/**
 * Creates a Deepgram transcription provider using WebSocket streaming for low latency.
 *
 * Preferred usage (secure):
 *   1. Fetch temporary token from backend via DeepgramTokenService
 *   2. Pass token to createTranscriptionProvider({ token })
 *   3. Token is valid for 30 seconds, but WebSocket stays connected
 *
 * Features:
 * - WebSocket for real-time streaming (not HTTP batching)
 * - Interim results enabled for immediate partial transcripts (~500ms)
 * - 16kHz sample rate for efficiency
 * - Raw binary audio encoding
 * - Dual stream support (mic + system audio)
 *
 * Latency: ~500-1000ms for partial results, ~1-2s for final results
 */
export function createTranscriptionProvider(
  options?: TranscriptionProviderOptions
): ITranscriptionProvider {
  if (options?.token) {
    // Preferred: Use temporary JWT token from backend
    logger.info('Creating Deepgram provider with JWT token (secure - API key stays on server)');
    return new DeepgramProvider({ token: options.token });
  }

  if (options?.apiKey) {
    // Fallback: Use direct API key (less secure)
    logger.info('Creating Deepgram provider with API key (legacy)');
    return new DeepgramProvider({ apiKey: options.apiKey });
  }

  // Last resort: environment variable
  const envKey = process.env.DEEPGRAM_API_KEY || '';
  if (envKey) {
    logger.info('Creating Deepgram provider with env API key');
    return new DeepgramProvider({ apiKey: envKey });
  }

  logger.warn('No Deepgram credentials provided - transcription will fail');
  return new DeepgramProvider({ apiKey: '' });
}

/**
 * @deprecated Use createTranscriptionProvider({ token }) with DeepgramTokenService instead.
 * This function is kept for backwards compatibility.
 */
export function createTranscriptionProviderLegacy(
  _assemblyAiKey?: string,
  deepgramKey?: string,
  _hostedTokenManager?: { getAssemblyAIToken: () => Promise<string | null> },
  _useHostedTokens?: boolean
): ITranscriptionProvider {
  const apiKey = deepgramKey || process.env.DEEPGRAM_API_KEY || '';
  logger.info('Creating Deepgram provider (legacy function)', { keyPresent: !!apiKey });
  return new DeepgramProvider({ apiKey });
}

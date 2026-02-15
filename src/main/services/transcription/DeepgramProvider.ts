import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { v4 as uuidv4 } from 'uuid';
import { inspect } from 'util';
import WebSocket from 'ws';
import { BaseDualStreamProvider } from './BaseDualStreamProvider';
import { createLogger } from '../../core/logger';

const logger = createLogger('Deepgram');

// Log SDK version at load time
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('@deepgram/sdk/package.json');
  logger.info('Deepgram SDK loaded', {
    version: pkg.version,
    supportsJWT: pkg.version >= '3.4.0',
  });
} catch {
  logger.warn('Could not determine Deepgram SDK version');
}

export interface DeepgramProviderOptions {
  /** API key (uses Token auth scheme) - legacy, less secure */
  apiKey?: string;
  /** JWT token (uses Bearer auth scheme) - preferred, more secure */
  token?: string;
}

export class DeepgramProvider extends BaseDualStreamProvider {
  readonly name = 'Deepgram';

  private credential: string;
  private useToken: boolean;
  private micConnection: LiveClient | null = null;
  private systemConnection: LiveClient | null = null;
  private resampleLogCount: number = 0;

  /**
   * Create a Deepgram provider.
   * @param options - Either { token } for JWT auth (preferred) or { apiKey } for key auth
   */
  constructor(options: DeepgramProviderOptions | string) {
    super();

    // Support legacy string constructor for backwards compatibility
    if (typeof options === 'string') {
      this.credential = options;
      this.useToken = false;
      logger.debug('Initializing with API key (legacy)', { keyPresent: !!options });
    } else if (options.token) {
      this.credential = options.token;
      this.useToken = true;
      logger.debug('Initializing with JWT token (secure)', { tokenPresent: true });
    } else if (options.apiKey) {
      this.credential = options.apiKey;
      this.useToken = false;
      logger.debug('Initializing with API key', { keyPresent: !!options.apiKey });
    } else {
      this.credential = '';
      this.useToken = false;
      logger.warn('No credential provided');
    }
  }

  /**
   * Validate credential and log connection details before attempting connection
   */
  private validateAndLogConnectionDetails(): void {
    logger.info('🔍 Pre-connection validation', {
      credentialLength: this.credential.length,
      credentialPrefix: this.credential.substring(0, 30) + '...',
      credentialSuffix: '...' + this.credential.substring(this.credential.length - 10),
      authMethod: this.useToken ? 'Bearer (JWT)' : 'Token (API Key)',
    });

    // Validate JWT token structure (should have 3 parts separated by dots)
    if (this.useToken) {
      const parts = this.credential.split('.');
      logger.info('JWT token structure', {
        parts: parts.length,
        headerLength: parts[0]?.length || 0,
        payloadLength: parts[1]?.length || 0,
        signatureLength: parts[2]?.length || 0,
        isValidStructure: parts.length === 3,
      });

      if (parts.length !== 3) {
        logger.error('❌ Invalid JWT token structure - should have 3 parts');
        throw new Error('Invalid JWT token format');
      }

      // Try to decode and log the payload (without sensitive data)
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const now = Math.floor(Date.now() / 1000);
        logger.info('JWT payload info', {
          exp: payload.exp,
          expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown',
          isExpired: payload.exp ? payload.exp < now : 'unknown',
          scopes: payload.scopes || payload.scope,
        });

        if (payload.exp && payload.exp < now) {
          logger.error('❌ JWT token has expired');
          throw new Error('JWT token has expired');
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'JWT token has expired') {
          throw error;
        }
        logger.warn('Could not decode JWT payload', { error });
      }
    }
  }

  /**
   * Test direct WebSocket connection to verify token works
   */
  private async testDirectWebSocket(): Promise<void> {
    logger.info('🧪 Testing direct WebSocket connection...');

    return new Promise((resolve, reject) => {
      const authHeader = this.useToken
        ? `Bearer ${this.credential}`
        : `Token ${this.credential}`;

      const ws = new WebSocket(
        'wss://api.deepgram.com/v1/listen?model=nova-2-general&language=en&encoding=linear16&sample_rate=16000',
        {
          headers: {
            Authorization: authHeader,
          },
        }
      );

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Direct WebSocket test timeout after 5s'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        logger.info('✅ Direct WebSocket test successful - credentials valid');
        ws.close();
        resolve();
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        logger.error('❌ Direct WebSocket test failed', {
          message: err.message,
          code: (err as NodeJS.ErrnoException).code,
        });
        ws.close();
        reject(err);
      });

      ws.on('unexpected-response', (_req: unknown, res: { statusCode?: number; statusMessage?: string }) => {
        clearTimeout(timeout);
        logger.error('❌ Direct WebSocket got unexpected response', {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
        });
        ws.close();
        reject(new Error(`WebSocket auth failed: ${res.statusCode} ${res.statusMessage}`));
      });
    });
  }

  async connect(): Promise<void> {
    logger.info('Connecting to Deepgram WebSocket (low-latency streaming)', {
      authMethod: this.useToken ? 'JWT token (Bearer)' : 'API key (Token)',
    });
    this.startTime = Date.now();

    // Validate credential before connecting
    this.validateAndLogConnectionDetails();

    // Test direct WebSocket first to verify auth works
    try {
      await this.testDirectWebSocket();
    } catch (error) {
      logger.error('Direct WebSocket test failed - credentials may be invalid', { error });
      throw error;
    }

    // Create client with explicit auth configuration for JWT tokens
    const client = this.useToken
      ? createClient(this.credential, {
          global: {
            headers: {
              Authorization: `Bearer ${this.credential}`,
            },
          },
        })
      : createClient(this.credential);

    logger.info('Deepgram client created', {
      authMethod: this.useToken ? 'Bearer (explicit header)' : 'Token (default)',
    });

    // ✅ OPTIMIZED CONFIGURATION FOR LONGER, MORE ACCURATE TRANSCRIPTS
    const liveOptions = {
      model: 'nova-2-general',      // Optimized for real-time streaming
      language: 'en',
      smart_format: true,           // Automatic punctuation and capitalization
      interim_results: true,        // Enable partial transcripts for real-time feedback
      encoding: 'linear16',         // PCM 16-bit format
      sample_rate: 16000,           // 16kHz (downsampled from 48kHz for efficiency)
      channels: 1,                  // Mono audio
      diarize: false,               // Speaker diarization disabled (can add latency)
      
      // 🔧 KEY CHANGES: These settings prevent fragmentation and allow longer sentences
      endpointing: 1500,            // INCREASED to 1.5s - tolerate longer natural pauses mid-sentence
      utterance_end_ms: 3500,       // INCREASED to 3.5s - only finalize after clear end of speech
      vad_events: true,             // Voice Activity Detection
      
      // 🆕 ADDITIONAL SETTINGS for better accuracy
      punctuate: true,              // Enable punctuation (redundant with smart_format but explicit)
      profanity_filter: false,      // Don't censor words
      redact: false,                // Don't redact sensitive info
      
      // 🆕 INTERIM RESULTS CONFIGURATION
      // This controls how often you get partial results
      // Lower values = more updates but potentially more fragmented
      // Higher values = fewer updates but more complete phrases
      // Omitting this lets Deepgram use optimal defaults
    };

    logger.info('✅ Using optimized Deepgram configuration for longer transcripts', {
      endpointing: `${liveOptions.endpointing}ms (tolerates natural pauses)`,
      utterance_end_ms: `${liveOptions.utterance_end_ms}ms (waits for clear speech end)`,
      model: liveOptions.model,
    });

    // Create dual connections for mic and system audio
    this.micConnection = client.listen.live(liveOptions);
    this.systemConnection = client.listen.live(liveOptions);

    // Setup handlers for both connections in parallel
    const micPromise = this.setupConnectionHandlers(this.micConnection, 'mic');
    const systemPromise = this.setupConnectionHandlers(this.systemConnection, 'system');

    try {
      await Promise.all([micPromise, systemPromise]);
      logger.info('✅ Connected to both Deepgram streams (mic + system)');
    } catch (error) {
      const err = error as Error;
      logger.error('❌ Failed to connect to Deepgram', {
        errorName: err?.name,
        errorMessage: err?.message,
        errorStack: err?.stack,
      });
      throw error;
    }
  }

  private setupConnectionHandlers(
    connection: LiveClient,
    source: 'mic' | 'system'
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      // Add 10-second timeout to detect connection hangs
      const timeout = setTimeout(() => {
        if (!resolved) {
          const timeoutError = new Error(`Connection timeout after 10s for ${source}`);
          logger.error('⏰ Connection timeout', {
            source,
            timeoutMs: 10000,
            message: timeoutError.message,
          });
          reject(timeoutError);
        }
      }, 10000);

      connection.on(LiveTranscriptionEvents.Open, () => {
        resolved = true;
        clearTimeout(timeout);
        logger.info('✅ WebSocket connection established', {
          source,
          timestamp: new Date().toISOString(),
        });
        this.setConnectionState(source, true);
        resolve();
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        if (!this.transcriptCallback) return;

        const transcript = data.channel?.alternatives?.[0];
        if (!transcript?.transcript || transcript.transcript.trim() === '') return;

        const isFinal = data.is_final === true;
        
        // 📊 Log transcript lengths to monitor improvement
        if (isFinal) {
          const wordCount = transcript.transcript.split(/\s+/).length;
          logger.debug('Final transcript received', { 
            source, 
            preview: transcript.transcript.slice(0, 50) + '...',
            wordCount,
            characterCount: transcript.transcript.length
          });
        }

        const segment = this.createSegment(
          transcript.transcript,
          source,
          isFinal,
          transcript.words
        );
        this.transcriptCallback(segment, isFinal);
      });

      connection.on(LiveTranscriptionEvents.Error, (error) => {
        resolved = true;
        clearTimeout(timeout);

        // Comprehensive error logging
        const err = error as Record<string, unknown>;
        logger.error('❌ Deepgram connection error (detailed)', {
          source,
          errorType: typeof error,
          errorConstructor: error?.constructor?.name,
          message: err?.message || 'No message',
          code: err?.code || 'No code',
          reason: err?.reason || 'No reason',
          statusCode: err?.statusCode || err?.status || 'No status',
          stack: err?.stack || 'No stack',
          stringified: JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
          inspected: inspect(error, { depth: 5 }),
        });
        reject(error);
      });

      connection.on(LiveTranscriptionEvents.Close, (event) => {
        resolved = true;
        clearTimeout(timeout);
        const closeEvent = event as { code?: number; reason?: string; wasClean?: boolean };
        logger.warn('🔌 Connection closed', {
          source,
          code: closeEvent.code,
          reason: closeEvent.reason,
          wasClean: closeEvent.wasClean,
          timestamp: new Date().toISOString(),
        });
        this.setConnectionState(source, false);
      });

      // Handle VAD events (optional - for logging voice activity)
      connection.on(LiveTranscriptionEvents.Metadata, (data) => {
        if (data.type === 'SpeechStarted') {
          logger.debug('🎤 Speech detected', { source });
        }
      });
    });
  }

  private createSegment(
    text: string,
    source: 'mic' | 'system',
    isFinal: boolean,
    words?: Array<{ word: string; confidence: number; start: number; end: number }>
  ) {
    const mappedWords = (words || []).map((w) => ({
      text: w.word,
      confidence: w.confidence,
      isFinal,
      start: Math.round(w.start * 1000), // Convert to ms
      end: Math.round(w.end * 1000),
    }));

    return this.createBaseSegment(
      uuidv4(),
      text,
      source,
      isFinal,
      words?.[0]?.confidence ?? 0.95,
      mappedWords
    );
  }

  /**
   * Resample audio from 48kHz to 16kHz using simple decimation
   * Reduces data by 3x, lowering latency and bandwidth
   * Note: This is a simple decimation (taking every 3rd sample)
   * For production, consider using a proper resampling library for better quality
   */
  private resample48kTo16k(audioData: ArrayBuffer): ArrayBuffer {
    const input = new Int16Array(audioData);
    // 48kHz → 16kHz: take every 3rd sample
    const output = new Int16Array(Math.floor(input.length / 3));

    for (let i = 0; i < output.length; i++) {
      output[i] = input[i * 3];
    }

    // Log resampling stats periodically (first call, then every 100 calls)
    this.resampleLogCount++;
    if (this.resampleLogCount === 1 || this.resampleLogCount % 100 === 0) {
      logger.debug('Audio resampling stats', {
        inputSamples: input.length,
        outputSamples: output.length,
        inputBytes: audioData.byteLength,
        outputBytes: output.buffer.byteLength,
        ratio: (input.length / output.length).toFixed(2),
        callCount: this.resampleLogCount,
      });
    }

    return output.buffer;
  }

  protected sendToMic(audioData: ArrayBuffer): void {
    const resampled = this.resample48kTo16k(audioData);
    this.micConnection?.send(resampled);
  }

  protected sendToSystem(audioData: ArrayBuffer): void {
    const resampled = this.resample48kTo16k(audioData);
    this.systemConnection?.send(resampled);
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting from Deepgram');

    if (this.micConnection) {
      this.micConnection.requestClose();
      this.micConnection = null;
    }

    if (this.systemConnection) {
      this.systemConnection.requestClose();
      this.systemConnection = null;
    }

    this.resetState();
    logger.info('✅ Disconnected from Deepgram');
  }
}
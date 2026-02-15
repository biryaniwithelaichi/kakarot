import { v4 as uuidv4 } from 'uuid';
import { BaseDualStreamProvider } from './BaseDualStreamProvider';
import { createLogger } from '../../core/logger';
import { getBackendAPI } from '../../providers/BackendAPIProvider';
import { AUDIO_CONFIG } from '../../config/constants';

const logger = createLogger('BackendTranscription');

/**
 * Transcription provider that routes audio through the Treeto backend.
 * Accumulates audio chunks and periodically sends them for transcription.
 */
export class BackendTranscriptionProvider extends BaseDualStreamProvider {
  readonly name = 'Backend';

  // Audio buffers for mic and system
  private micBuffer: Int16Array = new Int16Array(0);
  private systemBuffer: Int16Array = new Int16Array(0);

  // Transcription intervals
  private micInterval: NodeJS.Timeout | null = null;
  private systemInterval: NodeJS.Timeout | null = null;

  // Chunk counter for segment IDs
  private micChunkCount = 0;
  private systemChunkCount = 0;

  // Transcription interval in ms (send audio every 3 seconds for near-real-time)
  private readonly TRANSCRIBE_INTERVAL_MS = 3000;
  // Minimum samples required to send (avoid sending tiny chunks)
  private readonly MIN_SAMPLES = AUDIO_CONFIG.SAMPLE_RATE * 1; // 1 second minimum

  constructor() {
    super();
    logger.info('Backend transcription provider initialized');
  }

  async connect(): Promise<void> {
    logger.info('Connecting backend transcription provider');
    this.startTime = Date.now();

    // Start periodic transcription for both streams
    this.micInterval = setInterval(() => this.processBuffer('mic'), this.TRANSCRIBE_INTERVAL_MS);
    this.systemInterval = setInterval(() => this.processBuffer('system'), this.TRANSCRIBE_INTERVAL_MS);

    // Mark connections as ready
    this.setConnectionState('mic', true);
    this.setConnectionState('system', true);

    logger.info('Backend transcription provider connected');
  }

  private async processBuffer(source: 'mic' | 'system'): Promise<void> {
    const buffer = source === 'mic' ? this.micBuffer : this.systemBuffer;

    if (buffer.length < this.MIN_SAMPLES) {
      logger.debug('Buffer too small, skipping', { source, samples: buffer.length, minRequired: this.MIN_SAMPLES });
      return;
    }

    // Copy and clear the buffer
    const audioData = new Int16Array(buffer);
    if (source === 'mic') {
      this.micBuffer = new Int16Array(0);
    } else {
      this.systemBuffer = new Int16Array(0);
    }

    // Convert Int16 to base64
    const base64Audio = this.int16ToBase64(audioData);

    try {
      const backendAPI = getBackendAPI();
      const response = await backendAPI.transcribe({
        audio: base64Audio,
        encoding: 'linear16',
        sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
        channels: AUDIO_CONFIG.CHANNELS,
        language: 'en',
      });

      if (response.transcript && response.transcript.trim() && this.transcriptCallback) {
        const chunkCount = source === 'mic' ? ++this.micChunkCount : ++this.systemChunkCount;
        const segmentId = `${source}-${chunkCount}`;

        logger.debug('Transcript received', {
          source,
          text: response.transcript.slice(0, 30),
          wordCount: response.words?.length,
        });

        // Create segment from response
        const segment = this.createBaseSegment(
          segmentId,
          response.transcript,
          source,
          true, // Always final for chunked transcription
          response.confidence || 0.95,
          (response.words || []).map((w) => ({
            text: w.word,
            confidence: w.confidence,
            isFinal: true,
            start: w.start,
            end: w.end,
          }))
        );

        this.transcriptCallback(segment, true);
      }
    } catch (error) {
      logger.error('Transcription failed', error as Error, { source });
    }
  }

  private int16ToBase64(int16Array: Int16Array): string {
    // Convert Int16Array to Uint8Array (2 bytes per sample, little-endian)
    const uint8Array = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);

    // Convert to base64
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return Buffer.from(binary, 'binary').toString('base64');
  }

  protected sendToMic(audioData: ArrayBuffer): void {
    // Convert ArrayBuffer to Int16Array and append to buffer
    const samples = new Int16Array(audioData);
    const newBuffer = new Int16Array(this.micBuffer.length + samples.length);
    newBuffer.set(this.micBuffer);
    newBuffer.set(samples, this.micBuffer.length);
    this.micBuffer = newBuffer;
  }

  protected sendToSystem(audioData: ArrayBuffer): void {
    // Convert ArrayBuffer to Int16Array and append to buffer
    const samples = new Int16Array(audioData);
    const newBuffer = new Int16Array(this.systemBuffer.length + samples.length);
    newBuffer.set(this.systemBuffer);
    newBuffer.set(samples, this.systemBuffer.length);
    this.systemBuffer = newBuffer;
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting backend transcription provider');

    // Stop intervals
    if (this.micInterval) {
      clearInterval(this.micInterval);
      this.micInterval = null;
    }
    if (this.systemInterval) {
      clearInterval(this.systemInterval);
      this.systemInterval = null;
    }

    // Process any remaining audio in buffers
    await this.processBuffer('mic');
    await this.processBuffer('system');

    // Clear buffers
    this.micBuffer = new Int16Array(0);
    this.systemBuffer = new Int16Array(0);

    this.resetState();
    logger.info('Backend transcription provider disconnected');
  }
}

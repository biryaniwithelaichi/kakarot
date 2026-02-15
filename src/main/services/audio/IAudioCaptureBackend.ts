import { EventEmitter } from 'events';

export interface AudioChunk {
  data: Buffer;
}

export interface AudioCaptureConfig {
  sampleRate: number;
  chunkDurationMs: number;
  channels?: 1 | 2;
}

export interface IAudioCaptureBackend extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  isCapturing(): boolean;

  on(event: 'data', listener: (chunk: AudioChunk) => void): this;
  on(event: 'start', listener: () => void): this;
  on(event: 'stop', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;

  emit(event: 'data', chunk: AudioChunk): boolean;
  emit(event: 'start'): boolean;
  emit(event: 'stop'): boolean;
  emit(event: 'error', error: Error): boolean;
}

export abstract class BaseAudioBackend extends EventEmitter implements IAudioCaptureBackend {
  protected capturing = false;
  protected config: AudioCaptureConfig;
  protected buffer: Buffer = Buffer.alloc(0);
  protected chunkSize: number;

  constructor(config: AudioCaptureConfig) {
    super();
    this.config = config;
    const channels = config.channels || 1;
    // Calculate chunk size: sampleRate * channels * bytesPerSample (16-bit = 2) * duration
    this.chunkSize = Math.floor(config.sampleRate * channels * 2 * (config.chunkDurationMs / 1000));
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  isCapturing(): boolean {
    return this.capturing;
  }

  /**
   * Accumulates incoming audio data and emits complete chunks.
   * Call this from subclasses when receiving raw audio data.
   */
  protected processIncomingData(data: Buffer): void {
    if (!this.capturing) return;

    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.subarray(0, this.chunkSize);
      this.buffer = this.buffer.subarray(this.chunkSize);

      const audioChunk: AudioChunk = { data: Buffer.from(chunk) };
      this.emit('data', audioChunk);
    }
  }

  protected resetBuffer(): void {
    this.buffer = Buffer.alloc(0);
  }
}

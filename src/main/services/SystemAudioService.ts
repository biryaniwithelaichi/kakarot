import type { ITranscriptionProvider } from '@main/services/transcription';
import { createLogger } from '@main/core/logger';
import { AudioBackendFactory, IAudioCaptureBackend, AudioChunk } from '@main/services/audio';
import { AECProcessor } from '@main/audio/native/AECProcessor';
import { AUDIO_CONFIG } from '@main/config/constants';

const logger = createLogger('SystemAudio');

type AudioLevelCallback = (level: number) => void;

export class SystemAudioService {
  private backend: IAudioCaptureBackend | null = null;
  private transcriptionProvider: ITranscriptionProvider | null = null;
  private audioLevelCallback: AudioLevelCallback | null = null;
  private capturing: boolean = false;
  private aecProcessor: AECProcessor | null = null;
  private onSystemAudioCallback: ((samples: Float32Array, timestamp: number) => void) | null = null;

  onAudioLevel(callback: AudioLevelCallback): void {
    this.audioLevelCallback = callback;
  }

  /**
 * Set callback to receive system audio for AEC synchronization
 */
onSystemAudio(callback: (samples: Float32Array, timestamp: number) => void): void {
  this.onSystemAudioCallback = callback;
}

/**
 * Set external AEC processor (shared with recording handlers)
 */
setAECProcessor(processor: AECProcessor | null): void {
  this.aecProcessor = processor;
}

  async start(transcriptionProvider: ITranscriptionProvider): Promise<void> {
    if (this.capturing) {
      logger.warn('Already capturing');
      return;
    }

    logger.info('Starting system audio capture', { platform: process.platform });
    this.transcriptionProvider = transcriptionProvider;

    // Create platform-specific backend
    this.backend = await AudioBackendFactory.create({
      sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
      chunkDurationMs: AUDIO_CONFIG.CHUNK_DURATION_MS,
      channels: AUDIO_CONFIG.CHANNELS,
    });

    let chunkCount = 0;
    this.backend.on('data', (chunk: AudioChunk) => {
      if (!this.capturing || !this.transcriptionProvider) {
        return;
      }

      chunkCount++;
      if (chunkCount <= 3 || chunkCount % 50 === 0) {
        logger.debug('Audio chunk received', { chunk: chunkCount, bytes: chunk.data.length });
      }

      // Convert Node.js Buffer to Float32Array for AEC processing
      const float32Samples = this.bufferToFloat32(chunk.data);
      // Send to AECSync for timestamp-based synchronization (using absolute time)
      if (this.onSystemAudioCallback) {
      const timestamp = Date.now();
      this.onSystemAudioCallback(float32Samples, timestamp);
      }
      // Feed system audio (render path) through AEC as reference
      if (this.aecProcessor && this.aecProcessor.isReady()) {
        try {
          const success = this.aecProcessor.processRenderAudio(float32Samples);
          if (!success) {
            logger.warn('AEC render processing returned false');
          }
        } catch (err) {
          logger.warn('AEC render processing failed', {
            error: (err as Error).message,
          });
        }
      }

      // Convert to ArrayBuffer for transcription provider
      const uint8Array = new Uint8Array(chunk.data);
      const arrayBuffer = uint8Array.buffer.slice(
        uint8Array.byteOffset,
        uint8Array.byteOffset + uint8Array.byteLength
      );

      // Calculate RMS level for UI visualization
      const level = this.calculateRmsLevel(chunk.data);

      if (this.audioLevelCallback) {
        this.audioLevelCallback(level);
      }

      this.transcriptionProvider.sendAudio(arrayBuffer, 'system');
    });

    this.backend.on('start', () => {
      logger.info('Audio backend started');
      this.capturing = true;
    });

    this.backend.on('stop', () => {
      logger.info('Audio backend stopped');
      this.capturing = false;
    });

    this.backend.on('error', (error: Error) => {
      logger.error('Audio backend error', error);
    });

    try {
      await this.backend.start();
    } catch (error) {
      logger.error('Failed to start audio backend', error as Error);
      this.backend = null;
      this.transcriptionProvider = null;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.backend) {
      return;
    }

    logger.info('Stopping system audio capture');
    this.capturing = false;

    // Don't destroy shared AEC processor - it's owned by recordingHandlers
   this.aecProcessor = null;

    try {
      await this.backend.stop();
    } catch (error) {
      logger.error('Error stopping audio backend', error as Error);
    }

    this.backend = null;
    this.transcriptionProvider = null;
    this.audioLevelCallback = null;
  }

  pause(): void {
    this.capturing = false;
  }

  resume(): void {
    if (this.backend && this.transcriptionProvider) {
      this.capturing = true;
    }
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  // Calculate RMS level from 16-bit signed integer PCM data
  private calculateRmsLevel(buffer: Buffer): number {
    const samples = new Int16Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / 2
    );

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      // Normalize to -1.0 to 1.0 range
      const normalized = samples[i] / 32768;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    // Convert to 0-1 range with some scaling for better visualization
    return Math.min(1, rms * 3);
  }

  // Convert 16-bit PCM buffer to Float32Array for AEC processing
  private bufferToFloat32(buffer: Buffer): Float32Array {
    const samples = new Int16Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / 2
    );

    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      // Normalize to -1.0 to 1.0 range
      float32[i] = samples[i] / 32768;
    }

    return float32;
  }
}
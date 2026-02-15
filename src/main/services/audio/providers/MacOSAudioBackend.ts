import { app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { BaseAudioBackend, AudioCaptureConfig, AudioChunk } from '@main/services/audio/IAudioCaptureBackend';
import { createLogger } from '@main/core/logger';

const logger = createLogger('MacOSAudio');

// Use a simple interface - audiotee is dynamically imported
interface AudioTeeInstance {
  on(event: 'data', callback: (chunk: { data: Buffer }) => void): void;
  on(event: 'start', callback: () => void): void;
  on(event: 'stop', callback: () => void): void;
  on(event: 'error', callback: (error: Error) => void): void;
  on(event: 'log', callback: (level: string, message: { message: string }) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

function getAudioTeeBinaryPath(): string {
  // Try multiple candidates to avoid env/path issues in dev
  const candidates: string[] = [];

  // Packaged app resources
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'audiotee'));
  }

  // App path node_modules
  try {
    const appPath = app.getAppPath();
    candidates.push(join(appPath, 'node_modules', 'audiotee', 'bin', 'audiotee'));
    // In Vite dev, appPath may point to dist; try parent
    candidates.push(join(appPath, '..', 'node_modules', 'audiotee', 'bin', 'audiotee'));
  } catch {
    // ignore
  }

  // Current working directory node_modules (dev)
  candidates.push(join(process.cwd(), 'node_modules', 'audiotee', 'bin', 'audiotee'));

  // Relative from compiled __dirname
  candidates.push(join(__dirname, '..', '..', '..', '..', 'node_modules', 'audiotee', 'bin', 'audiotee'));
  candidates.push(join(__dirname, '..', '..', '..', 'node_modules', 'audiotee', 'bin', 'audiotee'));

  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Fallback to last candidate (may error, but logged)
  return candidates[candidates.length - 1];
}

export class MacOSAudioBackend extends BaseAudioBackend {
  private audiotee: AudioTeeInstance | null = null;

  constructor(config: AudioCaptureConfig) {
    super(config);
  }

  async start(): Promise<void> {
    if (this.capturing) {
      logger.warn('Already capturing');
      return;
    }

    logger.info('Starting macOS system audio capture');

    const binaryPath = getAudioTeeBinaryPath();
    logger.debug('AudioTee binary path', { path: binaryPath });

    const { AudioTee } = await import('audiotee');

    this.audiotee = new AudioTee({
      sampleRate: this.config.sampleRate,
      chunkDurationMs: this.config.chunkDurationMs,
      binaryPath,
    }) as AudioTeeInstance;

    this.audiotee.on('data', (chunk: { data: Buffer }) => {
      if (!this.capturing) return;
      const audioChunk: AudioChunk = { data: chunk.data };
      this.emit('data', audioChunk);
    });

    this.audiotee.on('start', () => {
      logger.info('AudioTee started');
      this.capturing = true;
      this.emit('start');
    });

    this.audiotee.on('stop', () => {
      logger.info('AudioTee stopped');
      this.capturing = false;
      this.emit('stop');
    });

    this.audiotee.on('error', (error: Error) => {
      logger.error('AudioTee error', error);
      this.emit('error', error);
    });

    this.audiotee.on('log', (level: string, message: { message: string }) => {
      logger.debug('AudioTee log', { level, message: message.message });
    });

    try {
      await this.audiotee.start();
    } catch (error) {
      logger.error('Failed to start AudioTee', error as Error);
      this.audiotee = null;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.audiotee) {
      return;
    }

    logger.info('Stopping macOS system audio capture');
    this.capturing = false;

    try {
      // Set a timeout to forcefully stop if it takes too long
      const stopPromise = this.audiotee.stop();
      const timeoutPromise = new Promise<void>((resolve) => 
        setTimeout(() => {
          logger.warn('AudioTee stop timeout - may not have stopped cleanly');
          resolve();
        }, 2000)
      );
      
      await Promise.race([stopPromise, timeoutPromise]);
    } catch (error) {
      logger.error('Error stopping AudioTee', error as Error);
    }

    this.audiotee = null;
  }
}

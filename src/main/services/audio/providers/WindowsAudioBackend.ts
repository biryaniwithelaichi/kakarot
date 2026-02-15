import { app } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { BaseAudioBackend } from '@main/services/audio/IAudioCaptureBackend';
import { createLogger } from '@main/core/logger';

const logger = createLogger('WindowsAudio');

function getFFmpegPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'ffmpeg.exe');
  } else {
    // In development, expect ffmpeg in PATH or node_modules
    return 'ffmpeg';
  }
}

export class WindowsAudioBackend extends BaseAudioBackend {
  private process: ChildProcess | null = null;

  async start(): Promise<void> {
    if (this.capturing) {
      logger.warn('Already capturing');
      return;
    }

    logger.info('Starting Windows system audio capture via FFmpeg WASAPI');

    const ffmpegPath = getFFmpegPath();

    // FFmpeg command for WASAPI loopback capture
    // Uses the virtual-audio-capturer or direct WASAPI loopback
    const args = [
      '-f', 'dshow',
      '-i', 'audio=virtual-audio-capturer',  // Requires virtual audio capturer driver
      '-f', 's16le',                          // 16-bit signed little-endian PCM
      '-ar', String(this.config.sampleRate),
      '-ac', String(this.config.channels || 1),
      '-',                                     // Output to stdout
    ];

    logger.debug('Spawning FFmpeg', { path: ffmpegPath, args });

    try {
      this.process = spawn(ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      logger.error('Failed to spawn FFmpeg', error as Error);
      throw new Error('FFmpeg not found. Please ensure FFmpeg is installed.');
    }

    this.resetBuffer();

    this.process.stdout?.on('data', (data: Buffer) => {
      this.processIncomingData(data);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      // FFmpeg outputs progress info to stderr, filter noise
      if (message && !message.includes('frame=') && !message.includes('size=')) {
        logger.debug('FFmpeg stderr', { message });
      }
    });

    this.process.on('error', (error: Error) => {
      logger.error('FFmpeg process error', error);
      this.capturing = false;
      this.emit('error', error);
    });

    this.process.on('close', (code: number | null) => {
      if (code !== 0 && code !== null && this.capturing) {
        const error = new Error(`FFmpeg exited with code ${code}`);
        logger.error('FFmpeg process failed', error);
        this.capturing = false;
        this.emit('error', error);
      } else if (this.capturing) {
        logger.info('FFmpeg process closed normally');
        this.capturing = false;
        this.emit('stop');
      }
    });

    // Wait for first data chunk to confirm audio is flowing
    await new Promise<void>((resolve, reject) => {
      const startupTimeout = setTimeout(() => {
        this.process?.kill();
        reject(
          new Error(
            'FFmpeg failed to produce audio within timeout. Is virtual-audio-capturer installed?'
          )
        );
      }, 5000);

      const onFirstData = (): void => {
        clearTimeout(startupTimeout);
        this.capturing = true;
        this.emit('start');
        logger.info('Windows audio capture started');
        resolve();
      };

      const onError = (error: Error): void => {
        clearTimeout(startupTimeout);
        reject(error);
      };

      const onClose = (code: number | null): void => {
        clearTimeout(startupTimeout);
        if (code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code} before producing audio`));
        }
      };

      this.process?.stdout?.once('data', onFirstData);
      this.process?.once('error', onError);
      this.process?.once('close', onClose);
    });
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    logger.info('Stopping Windows system audio capture');
    this.capturing = false;

    // Send 'q' to FFmpeg stdin to gracefully quit
    this.process.stdin?.write('q');
    this.process.stdin?.end();

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 2000);

      this.process?.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
    this.resetBuffer();
    this.emit('stop');
  }
}

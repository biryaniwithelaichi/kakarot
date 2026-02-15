import { spawn, ChildProcess } from 'child_process';
import { BaseAudioBackend } from '@main/services/audio/IAudioCaptureBackend';
import { createLogger } from '@main/core/logger';

const logger = createLogger('LinuxAudio');

export class LinuxAudioBackend extends BaseAudioBackend {
  private process: ChildProcess | null = null;

  async start(): Promise<void> {
    if (this.capturing) {
      logger.warn('Already capturing');
      return;
    }

    logger.info('Starting Linux system audio capture via PipeWire');

    // Check if pw-record is available
    const checkProcess = spawn('which', ['pw-record']);
    await new Promise<void>((resolve, reject) => {
      checkProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('pw-record not found. Please install PipeWire: sudo apt install pipewire-audio-client-libraries'));
        } else {
          resolve();
        }
      });
    });

    // Get the default audio sink monitor
    // pw-record captures from the monitor of the default sink
    const args = [
      '--format', 's16',           // 16-bit signed integer
      '--rate', String(this.config.sampleRate),
      '--channels', String(this.config.channels || 1),
      '--target', '0',             // 0 = default sink monitor
      '-',                          // Output to stdout
    ];

    logger.debug('Spawning pw-record', { args });

    this.process = spawn('pw-record', args);
    this.resetBuffer();

    this.process.stdout?.on('data', (data: Buffer) => {
      this.processIncomingData(data);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        logger.debug('pw-record stderr', { message });
      }
    });

    this.process.on('error', (error: Error) => {
      logger.error('pw-record process error', error);
      this.capturing = false;
      this.emit('error', error);
    });

    this.process.on('close', (code: number | null) => {
      if (code !== 0 && code !== null && this.capturing) {
        const error = new Error(`pw-record exited with code ${code}`);
        logger.error('pw-record process failed', error);
        this.capturing = false;
        this.emit('error', error);
      } else if (this.capturing) {
        logger.info('pw-record process closed normally');
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
            'pw-record failed to produce audio within timeout. Is PipeWire running?'
          )
        );
      }, 5000);

      const onFirstData = (): void => {
        clearTimeout(startupTimeout);
        this.capturing = true;
        this.emit('start');
        logger.info('Linux audio capture started');
        resolve();
      };

      const onError = (error: Error): void => {
        clearTimeout(startupTimeout);
        reject(error);
      };

      const onClose = (code: number | null): void => {
        clearTimeout(startupTimeout);
        if (code !== 0) {
          reject(new Error(`pw-record exited with code ${code} before producing audio`));
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

    logger.info('Stopping Linux system audio capture');
    this.capturing = false;

    // Send SIGTERM to gracefully stop pw-record
    this.process.kill('SIGTERM');

    // Wait for process to exit with timeout
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

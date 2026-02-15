import { IAudioCaptureBackend, AudioCaptureConfig } from './IAudioCaptureBackend';
import { createLogger } from '@main/core/logger';

const logger = createLogger('AudioBackendFactory');

export type Platform = 'darwin' | 'win32' | 'linux';

function isPlatform(value: string): value is Platform {
  return value === 'darwin' || value === 'win32' || value === 'linux';
}

export class AudioBackendFactory {
  static async create(config: AudioCaptureConfig): Promise<IAudioCaptureBackend> {
    const platform = process.platform;

    logger.info('Creating audio backend', { platform });

    if (!isPlatform(platform)) {
      throw new Error(
        `Unsupported platform: ${platform}. System audio capture is only supported on macOS, Windows, and Linux.`
      );
    }

    switch (platform) {
      case 'darwin': {
        const { MacOSAudioBackend } = await import('./providers/MacOSAudioBackend');
        return new MacOSAudioBackend(config);
      }

      case 'linux': {
        const { LinuxAudioBackend } = await import('./providers/LinuxAudioBackend');
        return new LinuxAudioBackend(config);
      }

      case 'win32': {
        const { WindowsAudioBackend } = await import('./providers/WindowsAudioBackend');
        return new WindowsAudioBackend(config);
      }
    }
  }

  static getSupportedPlatforms(): Platform[] {
    return ['darwin', 'win32', 'linux'];
  }

  static isPlatformSupported(): boolean {
    return isPlatform(process.platform);
  }
}

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@main/core/logger';

const execFileAsync = promisify(execFile);
const logger = createLogger('HeadphoneDetector');

/**
 * Detects whether headphones are connected as the primary audio output.
 * Used to bypass AEC when headphones are in use (no echo possible).
 */
export class HeadphoneDetector {
  /**
   * Detect if headphones are the current output device.
   * Returns true if headphones detected, false otherwise.
   * On error, returns false (assumes speakers - safer for AEC).
   */
  async detect(): Promise<boolean> {
    try {
      switch (process.platform) {
        case 'darwin':
          return await this.detectMacOS();
        case 'win32':
          return await this.detectWindows();
        case 'linux':
          return await this.detectLinux();
        default:
          logger.warn('Unsupported platform for headphone detection', {
            platform: process.platform,
          });
          return false;
      }
    } catch (error) {
      logger.warn('Headphone detection failed, assuming speakers', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  private async detectMacOS(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('system_profiler', [
        'SPAudioDataType',
        '-json',
      ]);

      const data = JSON.parse(stdout);
      const audioData = data.SPAudioDataType || [];

      for (const section of audioData) {
        const items = section._items || [];
        for (const item of items) {
          const name = (item._name || '').toLowerCase();
          const defaultOutput = item.coreaudio_default_audio_output_device;

          // Check if headphones are the default output device
          if (
            defaultOutput === 'spaudio_yes' &&
            (name.includes('headphone') || name.includes('headset') || name.includes('airpod'))
          ) {
            logger.info('Headphones detected as default output', { device: item._name });
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      // Fallback: try simpler approach using system_profiler without JSON
      try {
        const { stdout } = await execFileAsync('system_profiler', ['SPAudioDataType']);
        const output = stdout.toLowerCase();

        // Look for headphone-related strings near "default output device"
        const lines = output.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (
            lines[i].includes('default output device: yes') &&
            i > 0 &&
            (lines[i - 1].includes('headphone') ||
              lines[i - 1].includes('headset') ||
              lines[i - 1].includes('airpod'))
          ) {
            return true;
          }
        }
        return false;
      } catch {
        throw error;
      }
    }
  }

  private async detectWindows(): Promise<boolean> {
    try {
      // Use PowerShell to query default audio endpoint
      const ps = `
        Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {}
'@
        Get-CimInstance Win32_SoundDevice | Where-Object { $_.Status -eq 'OK' } | Select-Object -ExpandProperty Name
      `;

      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', ps], {
        timeout: 5000,
      });

      const output = stdout.toLowerCase();
      const hasHeadphones =
        output.includes('headphone') ||
        output.includes('headset') ||
        output.includes('earphone');

      if (hasHeadphones) {
        logger.info('Headphones detected (Windows)');
      }

      return hasHeadphones;
    } catch (error) {
      logger.warn('Windows headphone detection failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  private async detectLinux(): Promise<boolean> {
    try {
      // Try PulseAudio first
      const { stdout } = await execFileAsync('pactl', ['list', 'sinks']);
      const output = stdout.toLowerCase();

      // Check for headphone/headset in active port
      if (output.includes('active port:')) {
        const lines = output.split('\n');
        for (const line of lines) {
          if (
            line.includes('active port:') &&
            (line.includes('headphone') || line.includes('headset'))
          ) {
            logger.info('Headphones detected (Linux/PulseAudio)');
            return true;
          }
        }
      }

      return false;
    } catch {
      // Try PipeWire if PulseAudio fails
      try {
        const { stdout } = await execFileAsync('pw-cli', ['list-objects']);
        const output = stdout.toLowerCase();
        const hasHeadphones = output.includes('headphone') || output.includes('headset');

        if (hasHeadphones) {
          logger.info('Headphones detected (Linux/PipeWire)');
        }

        return hasHeadphones;
      } catch (error) {
        logger.warn('Linux headphone detection failed', {
          error: (error as Error).message,
        });
        return false;
      }
    }
  }
}

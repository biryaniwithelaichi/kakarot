import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import { createLogger } from '@main/core/logger';

const logger = createLogger('MicActivityMonitor');

export type MicActivityUpdate = {
  apps: string[];
  raw: string;
  timestamp: number;
};

type UpdateHandler = (update: MicActivityUpdate) => void;

export class MicActivityMonitor {
  private process: ChildProcessWithoutNullStreams | null = null;
  private lineReader: readline.Interface | null = null;
  private running = false;
  private onUpdate: UpdateHandler;

  constructor(onUpdate: UpdateHandler) {
    this.onUpdate = onUpdate;
  }

  start(): void {
    if (this.running) {
      return;
    }

    if (process.platform !== 'darwin') {
      logger.info('Mic activity monitor is only supported on macOS', {
        platform: process.platform,
      });
      return;
    }

    const args = [
      'stream',
      '--style',
      'syslog',
      '--info',
      '--debug',
      '--predicate',
      'eventMessage CONTAINS[c] "Active activity attributions changed to"',
    ];

    logger.info('Starting macOS mic activity monitor', { args });
    this.process = spawn('log', args);
    this.running = true;

    this.process.on('error', (error) => {
      logger.error('Mic activity log stream error', { error: error.message });
      this.stop();
    });

    this.process.on('close', (code) => {
      if (this.running) {
        logger.warn('Mic activity log stream closed unexpectedly', { code });
      }
      this.stop();
    });

    this.lineReader = readline.createInterface({
      input: this.process.stdout,
    });

    this.lineReader.on('line', (line) => {
      const parsed = this.parseLine(line);
      if (!parsed) {
        return;
      }
      this.onUpdate({
        apps: parsed,
        raw: line,
        timestamp: Date.now(),
      });
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        logger.debug('Mic activity log stream stderr', { message });
      }
    });
  }

  stop(): void {
    this.running = false;

    if (this.lineReader) {
      this.lineReader.close();
      this.lineReader = null;
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  private parseLine(line: string): string[] | null {
    const marker = 'active activity attributions changed to';
    const lowerLine = line.toLowerCase();
    const index = lowerLine.indexOf(marker);
    if (index === -1) {
      return null;
    }

    let payload = line.slice(index + marker.length).trim();
    if (!payload) {
      return [];
    }

    if (payload.startsWith(':')) {
      payload = payload.slice(1).trim();
    }

    const lowerPayload = payload.toLowerCase();
    if (
      lowerPayload === 'null' ||
      lowerPayload === '(null)' ||
      payload === '()' ||
      payload === '[]'
    ) {
      return [];
    }

    if (lowerPayload.includes('<private>')) {
      return ['<private>'];
    }

    const bundleMatches = Array.from(
      payload.matchAll(/bundleID\s*=\s*([^;>\s]+)/g)
    ).map((match) => match[1]);

    if (bundleMatches.length > 0) {
      return this.unique(bundleMatches);
    }

    const quotedMatches = Array.from(payload.matchAll(/"([^"]+)"/g)).map(
      (match) => match[1]
    );
    if (quotedMatches.length > 0) {
      return this.unique(quotedMatches);
    }

    const trimmed = payload.replace(/^[\[(\s]+/, '').replace(/[\])\s]+$/, '');
    const commaParts = trimmed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    return this.unique(commaParts);
  }

  private unique(values: string[]): string[] {
    const seen = new Set<string>();
    for (const value of values) {
      const trimmed = value.trim();
      if (trimmed) {
        seen.add(trimmed);
      }
    }
    return Array.from(seen);
  }
}

import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from 'fs';
import { join } from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Set via environment variable, defaults to 'info' in production
const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(context: string, level: LogLevel, message: string, data?: LogContext): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;

  if (data && Object.keys(data).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

// File-based log persistence
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_FILES = 3;
let logDir: string | null = null;
let logFilePath: string | null = null;

/**
 * Initialize file logging. Call once after app.getPath('userData') is available.
 */
export function initializeFileLogging(userDataPath: string): void {
  logDir = join(userDataPath, 'logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  logFilePath = join(logDir, 'treeto.log');
  rotateIfNeeded();
}

function rotateIfNeeded(): void {
  if (!logFilePath || !logDir) return;
  try {
    if (!existsSync(logFilePath)) return;
    const stats = statSync(logFilePath);
    if (stats.size < MAX_LOG_SIZE) return;

    // Rotate: treeto.log -> treeto.1.log -> treeto.2.log (drop oldest)
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const older = join(logDir, `treeto.${i}.log`);
      const newer = i === 1 ? logFilePath : join(logDir, `treeto.${i - 1}.log`);
      if (existsSync(newer)) {
        renameSync(newer, older);
      }
    }
  } catch {
    // Rotation failure is non-fatal
  }
}

function writeToFile(formatted: string): void {
  if (!logFilePath) return;
  try {
    appendFileSync(logFilePath, formatted + '\n');
  } catch {
    // File write failure is non-fatal
  }
}

export class Logger {
  constructor(private context: string) {}

  debug(message: string, data?: LogContext): void {
    if (shouldLog('debug')) {
      const formatted = formatMessage(this.context, 'debug', message, data);
      // eslint-disable-next-line no-console
      console.log(formatted);
      writeToFile(formatted);
    }
  }

  info(message: string, data?: LogContext): void {
    if (shouldLog('info')) {
      const formatted = formatMessage(this.context, 'info', message, data);
      // eslint-disable-next-line no-console
      console.log(formatted);
      writeToFile(formatted);
    }
  }

  warn(message: string, data?: LogContext): void {
    if (shouldLog('warn')) {
      const formatted = formatMessage(this.context, 'warn', message, data);
      console.warn(formatted);
      writeToFile(formatted);
    }
  }

  error(message: string, error?: Error | unknown, data?: LogContext): void {
    if (shouldLog('error')) {
      const errorInfo = error instanceof Error
        ? { errorMessage: error.message, stack: error.stack }
        : error
          ? { errorValue: String(error) }
          : {};
      const formatted = formatMessage(this.context, 'error', message, { ...data, ...errorInfo });
      console.error(formatted);
      writeToFile(formatted);
    }
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}

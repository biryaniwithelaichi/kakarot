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

export class Logger {
  constructor(private context: string) {}

  debug(message: string, data?: LogContext): void {
    if (shouldLog('debug')) {
      // eslint-disable-next-line no-console
      console.log(formatMessage(this.context, 'debug', message, data));
    }
  }

  info(message: string, data?: LogContext): void {
    if (shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.log(formatMessage(this.context, 'info', message, data));
    }
  }

  warn(message: string, data?: LogContext): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage(this.context, 'warn', message, data));
    }
  }

  error(message: string, error?: Error | unknown, data?: LogContext): void {
    if (shouldLog('error')) {
      const errorInfo = error instanceof Error
        ? { errorMessage: error.message, stack: error.stack }
        : error
          ? { errorValue: String(error) }
          : {};
      console.error(formatMessage(this.context, 'error', message, { ...data, ...errorInfo }));
    }
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;
const debugEnabled = import.meta.env.VITE_DEBUG_LOGS === '1';
const shouldLog = isDev || debugEnabled;

function formatMessage(context: string, level: LogLevel, message: string, data?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
  if (data && Object.keys(data).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

export class Logger {
  constructor(private context: string) {}

  debug(message: string, data?: Record<string, unknown>): void {
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log(formatMessage(this.context, 'debug', message, data));
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log(formatMessage(this.context, 'info', message, data));
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.warn(formatMessage(this.context, 'warn', message, data));
    }
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorInfo = error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : error
        ? { errorValue: String(error) }
        : {};
    // eslint-disable-next-line no-console
    console.error(formatMessage(this.context, 'error', message, { ...data, ...errorInfo }));
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}

import { app, dialog } from 'electron';
import { createLogger } from './logger';

const logger = createLogger('ErrorHandler');

interface ErrorDetails {
  type: 'uncaughtException' | 'unhandledRejection' | 'fatal';
  error: Error;
  origin?: string;
}

function formatError(details: ErrorDetails): string {
  const { type, error, origin } = details;
  let message = `${type}: ${error.message}`;
  if (origin) {
    message += `\nOrigin: ${origin}`;
  }
  if (error.stack) {
    message += `\nStack: ${error.stack}`;
  }
  return message;
}

function showErrorDialog(details: ErrorDetails): void {
  const { type, error } = details;

  const isFatal = type === 'fatal' || type === 'uncaughtException';

  dialog.showMessageBoxSync({
    type: 'error',
    title: isFatal ? 'Application Error' : 'An error occurred',
    message: isFatal
      ? 'Kakarot encountered a critical error and needs to restart.'
      : 'An unexpected error occurred.',
    detail: error.message,
    buttons: isFatal ? ['Restart', 'Quit'] : ['OK'],
  });

  if (isFatal) {
    app.relaunch();
    app.exit(1);
  }
}

export function initializeErrorHandler(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error, origin: string) => {
    const details: ErrorDetails = { type: 'uncaughtException', error, origin };
    logger.error('Uncaught exception', {
      message: error.message,
      stack: error.stack,
      origin
    });

    if (app.isReady()) {
      showErrorDialog(details);
    } else {
      console.error(formatError(details));
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    const details: ErrorDetails = { type: 'unhandledRejection', error };

    logger.error('Unhandled rejection', {
      message: error.message,
      stack: error.stack
    });

    // Log but don't crash for unhandled rejections
    console.error(formatError(details));
  });

  // Handle warnings
  process.on('warning', (warning: Error) => {
    logger.warn('Process warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack
    });
  });

  logger.info('Global error handlers initialized');
}

export function reportError(error: Error, context?: Record<string, unknown>): void {
  logger.error('Reported error', {
    message: error.message,
    stack: error.stack,
    ...context
  });
}

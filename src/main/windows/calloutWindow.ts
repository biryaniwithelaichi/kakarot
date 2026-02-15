import { BrowserWindow, screen } from 'electron';
import { join } from 'path';
import { createLogger } from '../core/logger';

const logger = createLogger('CalloutWindow');

let calloutWindow: BrowserWindow | null = null;

export function createCalloutWindow(): BrowserWindow {
  // Position in bottom-right corner of primary display
  const display = screen.getPrimaryDisplay();
  const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = display.workArea;

  const windowWidth = 450;
  const windowHeight = 280;
  const margin = 30;

  // Position in top-right corner
  const x = displayX + displayWidth - windowWidth - margin;
  const y = displayY + margin;

  logger.info('Creating callout window', { displayX, displayY, displayWidth, displayHeight, x, y });

  calloutWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    focusable: false,
  });

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const baseUrl = process.env.VITE_DEV_SERVER_URL || `http://${process.env.VITE_DEV_SERVER_HOST || 'localhost'}:${process.env.VITE_DEV_SERVER_PORT || '5173'}`;
    calloutWindow.loadURL(`${baseUrl}/callout.html`);
  } else {
    calloutWindow.loadFile(join(__dirname, '../renderer/callout.html'));
  }

  return calloutWindow;
}

export function showCalloutWindow(): void {
  logger.info('showCalloutWindow called', {
    windowExists: !!calloutWindow,
    isVisible: calloutWindow?.isVisible(),
    bounds: calloutWindow?.getBounds()
  });
  if (calloutWindow && !calloutWindow.isVisible()) {
    calloutWindow.showInactive();
    logger.info('Callout window shown');
  }
}

export function hideCalloutWindow(): void {
  if (calloutWindow && calloutWindow.isVisible()) {
    calloutWindow.hide();
  }
}


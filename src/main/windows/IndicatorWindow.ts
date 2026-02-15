import { BrowserWindow, screen } from 'electron';
import { join } from 'path';
import { createLogger } from '../core/logger';
import { IPC_CHANNELS } from '@shared/ipcChannels';

const logger = createLogger('IndicatorWindow');

export class IndicatorWindow {
  private window: BrowserWindow | null = null;

  constructor() {
    this.createWindow();
  }

  private createWindow(): void {
    const display = screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: displayWidth } = display.workArea;

    const windowWidth = 180;
    const windowHeight = 50;
    const margin = 24;

    const x = displayX + displayWidth - windowWidth - margin;
    const y = displayY + margin;

    logger.info('Creating indicator window', { x, y, windowWidth, windowHeight });

    this.window = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: false,
    });

    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.setAlwaysOnTop(true, 'screen-saver', 1);
    this.window.setIgnoreMouseEvents(false);

    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
      const baseUrl =
        process.env.VITE_DEV_SERVER_URL ||
        `http://${process.env.VITE_DEV_SERVER_HOST || 'localhost'}:${process.env.VITE_DEV_SERVER_PORT || '5173'}`;
      this.window.loadURL(`${baseUrl}/indicator.html`);
    } else {
      this.window.loadFile(join(__dirname, '../renderer/indicator.html'));
    }
  }

  show(): void {
    if (this.window && !this.window.isVisible()) {
      this.window.showInactive();
    }
  }

  hide(): void {
    if (this.window && this.window.isVisible()) {
      this.window.hide();
    }
  }

  getPosition(): [number, number] | null {
    if (!this.window || this.window.isDestroyed()) return null;
    return this.window.getPosition() as [number, number];
  }

  setPosition(x: number, y: number): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setPosition(x, y);
  }

  sendAudioAmplitude(level: number): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(IPC_CHANNELS.INDICATOR_AUDIO_AMPLITUDE, level);
  }

  isVisible(): boolean {
    return !!this.window?.isVisible();
  }
}

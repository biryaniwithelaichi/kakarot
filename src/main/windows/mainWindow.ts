import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for sql.js WASM loading
    },
    titleBarStyle: 'hiddenInset',
    // Fine-tune macOS traffic light position (approx. 0.1–0.2 cm left shift)
    trafficLightPosition: { x: 6, y: 10 },
    show: false,
  });

  // Show window when ready to avoid flash
  mainWindow.once('ready-to-show', () => {
    console.log('[mainWindow] ready-to-show event fired, showing window');
    mainWindow.show();
  });

  // Add a timeout fallback in case ready-to-show doesn't fire
  setTimeout(() => {
    if (!mainWindow.isVisible()) {
      console.warn('[mainWindow] ready-to-show timeout - forcing window show');
      mainWindow.show();
    }
  }, 3000);

  // Log when page is loaded
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[mainWindow] did-finish-load event fired');
  });

  // Log any errors during page load
  mainWindow.on('unresponsive', () => {
    console.warn('[mainWindow] Window became unresponsive');
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app - check if we're in development
  const isDev = !app.isPackaged;

  if (isDev) {
    // In development, try multiple candidate URLs to avoid white screens when Vite auto-bumps the port
    const explicitUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL;
    const host = process.env.VITE_DEV_SERVER_HOST || 'localhost';
    const port = process.env.VITE_DEV_SERVER_PORT || '5173';
    const candidates = [
      explicitUrl,
      `http://${host}:${port}`,
      port !== '5173' ? `http://${host}:5173` : null,
      `http://${host}:5174`,
    ].filter(Boolean) as string[];

    const loadFirstAvailable = async () => {
      for (const target of candidates) {
        try {
          console.log('[mainWindow] Loading dev server URL:', target);
          await mainWindow.loadURL(target);
          return true;
        } catch (err) {
          console.warn('[mainWindow] Failed to load dev server candidate:', target, err);
        }
      }
      console.error('[mainWindow] All dev server candidates failed', { candidates });
      return false;
    };

    loadFirstAvailable().then((loaded) => {
      if (loaded) {
        mainWindow.webContents.openDevTools();
      }
    });
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

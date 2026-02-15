import { ipcMain, app, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { getContainer } from '../core/container';
import type { AppSettings } from '@shared/types';

export function registerSettingsHandlers(): void {
  const { settingsRepo } = getContainer();

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return settingsRepo.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (event, settings: Partial<AppSettings>) => {
    settingsRepo.updateSettings(settings);
    
    // Emit settings changed event to all renderer windows
    const updatedSettings = settingsRepo.getSettings();
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      window.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, updatedSettings);
    });
    
    // AI provider is now managed server-side via the backend
    // No local API key refresh needed
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_LOGIN_ITEM, (_, openAtLogin: boolean) => {
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: false,
    });
    return { success: true };
  });
}

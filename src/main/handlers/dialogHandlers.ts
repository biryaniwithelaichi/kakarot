import { ipcMain, dialog } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';

export function registerDialogHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Knowledge Base Folder',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
}

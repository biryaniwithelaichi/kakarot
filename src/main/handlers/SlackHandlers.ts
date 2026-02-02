import { ipcMain, BrowserWindow } from 'electron';
import { SlackService } from '../services/SlackService';
import { createLogger } from '../core/logger';

const logger = createLogger('SlackHandlers');
const slackService = new SlackService(); 

export function registerSlackHandlers() {
  
  ipcMain.handle('slack:connect', async () => {
    logger.info('Starting Slack OAuth flow');
    
    const authWindow = new BrowserWindow({
      width: 600, height: 700, show: true, modal: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const authUrl = slackService.getAuthorizationUrl();
    authWindow.loadURL(authUrl);

    return new Promise((resolve, reject) => {
      const handleCallback = async (url: string) => {
        if (url.startsWith('http://localhost:3000/oauth/slack')) {
          const rawUrl = new URL(url);
          const code = rawUrl.searchParams.get('code');
          
          if (code) {
            try {
              authWindow.destroy();
              const token = await slackService.exchangeCodeForToken(code);
              resolve(token);
            } catch (err) { reject(err); }
          } else {
             authWindow.destroy();
             reject(new Error('Auth failed'));
          }
        }
      };

      authWindow.webContents.on('will-redirect', (e, url) => handleCallback(url));
      authWindow.webContents.on('will-navigate', (e, url) => handleCallback(url));
      authWindow.on('closed', () => reject(new Error('Window closed')));
    });
  });

  ipcMain.handle('slack:getChannels', async (_, accessToken) => {
    return await slackService.getChannels(accessToken);
  });

  ipcMain.handle('slack:sendNote', async (_, { accessToken, channelId, text }) => {
    return await slackService.sendNote(accessToken, channelId, text);
  });
  
  logger.info('Slack handlers registered');
}
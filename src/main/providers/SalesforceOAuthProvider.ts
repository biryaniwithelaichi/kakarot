import { BrowserWindow } from 'electron';
import type { SalesforceOAuthToken } from '../services/SalesforceService';
import { SalesforceService } from '../services/SalesforceService';
import { createLogger } from '../core/logger';

const logger = createLogger('SalesforceOAuthProvider');
const CLOSE_URL = 'kakarot://close-oauth';

export type { SalesforceOAuthToken };

export class SalesforceOAuthProvider {
  private salesforceService: SalesforceService;
  private redirectUri: string;

  constructor(
    clientId: string, // Kept to match existing calls, but ignored
    redirectUri = 'http://localhost:3000/oauth/salesforce'
  ) {
    this.redirectUri = redirectUri;
    // ✅ FIX: Ignore the dummy clientId passed in. Use the hardcoded key in the Service.
    this.salesforceService = new SalesforceService(); 
  }

  async authenticate(mainWindow: BrowserWindow): Promise<SalesforceOAuthToken> {
    return new Promise((resolve, reject) => {
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: true,
        parent: mainWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const injectCloseButton = () => {
        const js = `
          (function() {
            if (document.getElementById('kakarot-oauth-close')) return;
            const btn = document.createElement('button');
            btn.id = 'kakarot-oauth-close';
            btn.setAttribute('aria-label', 'Close');
            btn.textContent = '\u00D7';
            btn.style.position = 'fixed';
            btn.style.top = '12px';
            btn.style.right = '12px';
            btn.style.zIndex = '2147483647';
            btn.style.width = '28px';
            btn.style.height = '28px';
            btn.style.borderRadius = '14px';
            btn.style.border = '1px solid rgba(0,0,0,0.2)';
            btn.style.background = 'rgba(255,255,255,0.92)';
            btn.style.color = '#111';
            btn.style.fontSize = '18px';
            btn.style.lineHeight = '26px';
            btn.style.cursor = 'pointer';
            btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            btn.onmouseenter = () => { btn.style.opacity = '0.9'; };
            btn.onmouseleave = () => { btn.style.opacity = '1'; };
            btn.onclick = () => { window.location.href = '${CLOSE_URL}'; };
            (document.body || document.documentElement).appendChild(btn);
          })();
        `;

        authWindow.webContents.executeJavaScript(js).catch(() => {
          // Ignore injection errors on restrictive pages
        });
      };

      const authUrl = this.salesforceService.getAuthorizationUrl();

      logger.info('Opening Salesforce OAuth window', {
        redirectUri: this.redirectUri,
        authUrlSnippet: authUrl.substring(0, 50) + '...',
      });

      authWindow.loadURL(authUrl);

      let isProcessingCode = false;

      const handleAuthCode = (code: string) => {
        if (isProcessingCode) return;
        isProcessingCode = true;

        logger.info('Authorization code received', { code: code.substring(0, 10) + '...' });

        // Clean up listeners
        authWindow.removeAllListeners('closed');
        authWindow.webContents.removeAllListeners('will-redirect');
        authWindow.webContents.removeAllListeners('will-navigate');
        authWindow.webContents.removeAllListeners('did-finish-load');

        this.salesforceService
          .exchangeCodeForToken(code)
          .then((token) => {
            authWindow.destroy();
            resolve(token);
          })
          .catch((err) => {
            authWindow.destroy();
            reject(err);
          });
      };

      const checkUrlForCode = (url: string): boolean => {
        if (url.startsWith(this.redirectUri)) {
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');
          const error = urlObj.searchParams.get('error');

          if (error) {
            authWindow.destroy();
            const errorDescription = urlObj.searchParams.get('error_description') || error;
            logger.error('OAuth authorization failed', { error, errorDescription });
            reject(new Error(`OAuth error: ${errorDescription}`));
            return true;
          }

          if (code) {
            handleAuthCode(code);
            return true;
          }
        }
        return false;
      };

      authWindow.webContents.on('did-finish-load', () => {
        const currentUrl = authWindow.webContents.getURL();
        injectCloseButton();
        checkUrlForCode(currentUrl);
      });

      authWindow.webContents.on('will-redirect', (event, url) => {
        if (url.startsWith(CLOSE_URL)) {
          event.preventDefault();
          authWindow.close();
          return;
        }
        if (checkUrlForCode(url)) {
          event.preventDefault();
        }
      });

      authWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith(CLOSE_URL)) {
          event.preventDefault();
          authWindow.close();
          return;
        }
        if (checkUrlForCode(url)) {
          event.preventDefault();
        }
      });

      authWindow.on('closed', () => {
        if (!isProcessingCode) {
          logger.warn('OAuth window closed by user');
          reject(new Error('OAuth window closed'));
        }
      });
    });
  }
}
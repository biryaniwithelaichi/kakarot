import { BrowserWindow } from 'electron';
import { createLogger } from '../core/logger';
import { BACKEND_BASE_URL } from './BackendAPIProvider';

const logger = createLogger('HubSpotOAuthProvider');
const CLOSE_URL = 'kakarot://close-oauth';

export interface HubSpotOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  connectedAt: number;
}

export class HubSpotOAuthProvider {
  private clientId: string;
  private redirectUri: string;

  constructor(clientId: string, redirectUri = 'http://localhost:3000/oauth/hubspot') {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
  }

  async authenticate(mainWindow: BrowserWindow): Promise<HubSpotOAuthToken> {
    return new Promise((resolve, reject) => {
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: true,
        parent: mainWindow,
        modal: true,
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

      const scopes = [
        'crm.objects.contacts.read',
        'crm.objects.contacts.write',
        'crm.objects.deals.read',
        'crm.schemas.deals.read',
        'crm.objects.custom.read',
        'crm.objects.invoices.read',
        'crm.objects.companies.read',
        'crm.objects.leads.read',
        'crm.schemas.companies.read',
      ];
      const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(
        this.redirectUri
      )}&scope=${encodeURIComponent(scopes.join(' '))}`;

      logger.info('Opening HubSpot OAuth window', {
        redirectUri: this.redirectUri,
        clientId: this.clientId,
        scopes,
      });

      authWindow.loadURL(authUrl);

      let isProcessingCode = false;

      const handleAuthCode = (code: string) => {
        if (isProcessingCode) return;
        isProcessingCode = true;

        logger.info('Authorization code received', { code: code.substring(0, 10) + '...' });
        authWindow.removeAllListeners('closed');

        this.exchangeCodeForToken(code)
          .then((token) => {
            authWindow.destroy();
            resolve(token);
          })
          .catch((err) => {
            authWindow.destroy();
            reject(err);
          });
      };

      authWindow.webContents.on('will-redirect', (event, url) => {
        logger.debug('OAuth redirect detected', { url });

        if (url.startsWith(CLOSE_URL)) {
          event.preventDefault();
          authWindow.close();
          return;
        }

        if (url.startsWith(this.redirectUri)) {
          event.preventDefault();

          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');
          const error = urlObj.searchParams.get('error');

          if (error) {
            authWindow.destroy();
            const errorDescription = urlObj.searchParams.get('error_description') || error;
            logger.error('OAuth authorization failed', { error, errorDescription });
            reject(new Error(`OAuth error: ${errorDescription}`));
            return;
          }

          if (code) {
            handleAuthCode(code);
            return;
          }
        }
      });

      authWindow.webContents.on('will-navigate', (event, url) => {
        logger.debug('OAuth navigation detected', { url });

        if (url.startsWith(CLOSE_URL)) {
          event.preventDefault();
          authWindow.close();
          return;
        }

        if (url.startsWith(this.redirectUri)) {
          event.preventDefault();

          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');
          const error = urlObj.searchParams.get('error');

          if (error) {
            authWindow.destroy();
            const errorDescription = urlObj.searchParams.get('error_description') || error;
            logger.error('OAuth authorization failed', { error, errorDescription });
            reject(new Error(`OAuth error: ${errorDescription}`));
            return;
          }

          if (code) {
            handleAuthCode(code);
            return;
          }
        }
      });

      authWindow.webContents.on('did-finish-load', () => {
        injectCloseButton();
      });

      authWindow.on('closed', () => {
        if (!isProcessingCode) {
          reject(new Error('OAuth window closed'));
        }
      });
    });
  }

  private async exchangeCodeForToken(code: string): Promise<HubSpotOAuthToken> {
    try {
      // Exchange code for token via backend (keeps client_secret secure on server)
      const backendEndpoint = `${BACKEND_BASE_URL}/api/auth/hubspot`;
      logger.info('Exchanging code via backend', { endpoint: backendEndpoint });

      const response = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirect_uri: this.redirectUri,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const data = await response.json();
      const { access_token, refresh_token, expires_in } = data;

      const token: HubSpotOAuthToken = {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + expires_in * 1000,
        connectedAt: Date.now(),
      };

      logger.info('HubSpot token exchanged successfully via backend');
      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to exchange code for token', { error: message });
      throw new Error(`Failed to authenticate with HubSpot: ${message}`);
    }
  }

  async refreshAccessToken(token: HubSpotOAuthToken): Promise<HubSpotOAuthToken> {
    if (!token.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      // Refresh token via backend (keeps client_secret secure on server)
      const backendEndpoint = `${BACKEND_BASE_URL}/api/auth/hubspot`;
      logger.info('Refreshing token via backend');

      const response = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: token.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${errorText}`);
      }

      const data = await response.json();
      const { access_token, expires_in } = data;

      return {
        ...token,
        accessToken: access_token,
        expiresAt: Date.now() + expires_in * 1000,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to refresh token', { error: message });
      throw new Error(`Failed to refresh HubSpot token: ${message}`);
    }
  }

  isTokenExpired(token: HubSpotOAuthToken): boolean {
    return Date.now() > token.expiresAt - 5 * 60 * 1000; // 5 min buffer
  }
}

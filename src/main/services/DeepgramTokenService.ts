import { createLogger } from '../core/logger';
import { BACKEND_BASE_URL } from '../providers/BackendAPIProvider';

const logger = createLogger('DeepgramTokenService');

export interface DeepgramTokenResponse {
  access_token: string;
  expires_in: number;
}

/**
 * Service for fetching temporary Deepgram tokens from the backend.
 *
 * This keeps the Deepgram API key secure on the server while allowing
 * the Electron app to connect directly to Deepgram with low latency.
 *
 * Flow:
 * 1. App requests token from backend (backend has the API key)
 * 2. Backend calls Deepgram's /v1/auth/grant endpoint
 * 3. Backend returns 30-second JWT to app
 * 4. App uses JWT to connect directly to Deepgram WebSocket
 */
export class DeepgramTokenService {
  private baseUrl: string;

  constructor(baseUrl: string = BACKEND_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch a temporary Deepgram token from the backend.
   * Token is valid for 30 seconds - call this immediately before connecting.
   */
  async getTemporaryToken(): Promise<DeepgramTokenResponse> {
    const url = `${this.baseUrl}/api/deepgram/token`;
    logger.info('Fetching temporary Deepgram token', { url });

    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Token fetch failed', { status: response.status, error: errorText });
        throw new Error(`Failed to fetch Deepgram token: ${response.status} ${errorText}`);
      }

      const data = await response.json() as DeepgramTokenResponse;
      const fetchTime = Date.now() - startTime;

      logger.info('Temporary Deepgram token received', {
        expiresIn: data.expires_in,
        fetchTimeMs: fetchTime,
        tokenPreview: data.access_token.substring(0, 20) + '...'
      });

      return data;
    } catch (error) {
      logger.error('Failed to fetch Deepgram token', error as Error);
      throw error;
    }
  }
}

// Singleton instance
let tokenServiceInstance: DeepgramTokenService | null = null;

export function getDeepgramTokenService(): DeepgramTokenService {
  if (!tokenServiceInstance) {
    tokenServiceInstance = new DeepgramTokenService();
  }
  return tokenServiceInstance;
}

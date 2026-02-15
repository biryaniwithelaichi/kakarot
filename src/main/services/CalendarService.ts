import { app, shell } from 'electron';
import { createServer } from 'http';
import { randomBytes, createHash } from 'crypto';
import type { AddressInfo } from 'net';
import type { CalendarConnections, CalendarEvent, OAuthTokens } from '@shared/types';
import { SettingsRepository } from '../data/repositories/SettingsRepository';
import { createLogger } from '../core/logger';
import { BACKEND_BASE_URL } from '../providers/BackendAPIProvider';

const logger = createLogger('CalendarService');

// TODO(refactor): Duplicated event fetching logic in this service:
// - listToday() and getUpcomingMeetings() have nearly identical multi-provider patterns
// - findCalendarEventForMeeting() and getEventById() have similar provider-switching logic
// - fetchGoogleEvents() and fetchOutlookEvents() share token refresh and error handling
// Extract common multi-provider fetching helper
type Provider = 'google' | 'outlook' | 'icloud';

interface OAuthConfig {
  provider: Provider;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope: string;
  redirectUri?: string;
  extraAuthParams?: Record<string, string>;
}

// Request throttling configuration
const MAX_CONCURRENT_CALENDAR_REQUESTS = 3;
const REQUEST_DELAY_MS = 200; // Delay between batches

export class CalendarService {
  // Track in-flight token refresh promises to deduplicate parallel refresh calls
  private tokenRefreshPromises: Map<string, Promise<OAuthTokens>> = new Map();

  // Semaphore for limiting concurrent calendar fetch requests
  private activeRequests = 0;
  private requestQueue: Array<() => void> = [];

  constructor(private readonly settingsRepo: SettingsRepository) {}

  /**
   * Acquire a slot for making a calendar request.
   * If at capacity, waits until a slot is available.
   */
  private async acquireRequestSlot(): Promise<void> {
    if (this.activeRequests < MAX_CONCURRENT_CALENDAR_REQUESTS) {
      this.activeRequests++;
      return;
    }

    // Wait for a slot to become available
    return new Promise((resolve) => {
      this.requestQueue.push(() => {
        this.activeRequests++;
        resolve();
      });
    });
  }

  /**
   * Release a request slot and process queued requests.
   */
  private releaseRequestSlot(): void {
    this.activeRequests--;

    // Process next queued request if any
    if (this.requestQueue.length > 0) {
      const next = this.requestQueue.shift();
      if (next) {
        // Add small delay between requests to avoid bursts
        setTimeout(next, REQUEST_DELAY_MS);
      }
    }
  }

  async connect(
    provider: Provider,
    payload?: { appleId: string; appPassword: string }
  ): Promise<CalendarConnections> {
    switch (provider) {
      case 'google': {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
          throw new Error('Google Calendar is not configured. Missing GOOGLE_CLIENT_ID.');
        }

        const tokens = await this.runOAuthFlow({
          provider,
          authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          clientId,
          scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/contacts.readonly',
          extraAuthParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        });

        // Fetch user profile from Google
        try {
          const axios = (await import('axios')).default;
          const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });
          tokens.userName = profileResponse.data.name;
          tokens.userEmail = profileResponse.data.email;
          tokens.userPhoto = profileResponse.data.picture;
          
          // Store in settings
          this.settingsRepo.updateSettings({
            userProfile: {
              name: profileResponse.data.name,
              email: profileResponse.data.email,
              photo: profileResponse.data.picture,
              provider: 'google',
            },
          });
        } catch (err) {
          logger.warn('Failed to fetch Google user profile', { error: (err as Error).message });
        }

        const updated = this.persistConnection('google', tokens);

        // Auto-populate visible calendars on first connection (after persistence)
        try {
          const calendarList = await this.listCalendars('google');
          if (calendarList.length > 0) {
            // Include all available calendars by default (they've already been filtered to owner/writer in listCalendars)
            // This ensures invites sent to the user appear in upcoming meetings
            const defaultVisible = calendarList.map(cal => cal.id);
            
            await this.setVisibleCalendars('google', defaultVisible);
            logger.info('Auto-populated visible Google calendars', { 
              total: calendarList.length,
              selected: defaultVisible.length,
              calendars: calendarList.map(c => ({ id: c.id, name: c.name }))
            });
          }
        } catch (err) {
          logger.warn('Failed to auto-populate visible Google calendars', { error: (err as Error).message });
        }

        logger.info('Google calendar connected');
        return updated;
      }
      case 'outlook': {
        const clientId = process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID;
        if (!clientId) {
          throw new Error('Microsoft Calendar is not configured. Missing OUTLOOK_CLIENT_ID or MICROSOFT_CLIENT_ID.');
        }

        const tokens = await this.runOAuthFlow({
          provider,
          authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
          tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          clientId,
          scope: 'User.Read Calendars.Read Contacts.Read',
          redirectUri: 'treeto://auth',
        });

        // Fetch user profile from Microsoft Graph
        try {
          const axios = (await import('axios')).default;
          const profileResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });
          const photoResponse = await axios.get('https://graph.microsoft.com/v1.0/me/photo/$value', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
            responseType: 'arraybuffer',
          }).catch(() => null);
          
          tokens.userName = profileResponse.data.displayName;
          tokens.userEmail = profileResponse.data.mail || profileResponse.data.userPrincipalName;
          if (photoResponse) {
            const base64Photo = Buffer.from(photoResponse.data).toString('base64');
            tokens.userPhoto = `data:image/jpeg;base64,${base64Photo}`;
          }
          
          // Store in settings
          this.settingsRepo.updateSettings({
            userProfile: {
              name: tokens.userName,
              email: tokens.userEmail,
              photo: tokens.userPhoto,
              provider: 'outlook',
            },
          });
        } catch (err) {
          logger.warn('Failed to fetch Outlook user profile', { error: (err as Error).message });
        }

        const updated = this.persistConnection('outlook', tokens);
        logger.info('Outlook calendar connected');
        return updated;
      }
      case 'icloud': {
        if (!payload?.appleId || !payload?.appPassword) {
          throw new Error('Apple ID and app-specific password required for iCloud');
        }
        // Store credentials separately from OAuth tokens for CalDAV usage
        const settings = this.settingsRepo.getSettings();
        const merged: CalendarConnections = {
          ...settings.calendarConnections,
          icloud: {
            appleId: payload.appleId,
            appPassword: payload.appPassword,
          },
        };
        this.settingsRepo.updateSettings({ calendarConnections: merged });
        logger.info('iCloud calendar connected (app-specific password stored)');
        return merged;
      }
      default:
        throw new Error(`Unsupported provider ${provider}`);
    }
  }

  async disconnect(provider: Provider): Promise<CalendarConnections> {
    const settings = this.settingsRepo.getSettings();
    const updated: CalendarConnections = { ...settings.calendarConnections };
    delete updated[provider];
    this.settingsRepo.updateSettings({ calendarConnections: updated });
    logger.info('Calendar disconnected', { provider });
    return updated;
  }

  async listToday(): Promise<CalendarEvent[]> {
    const settings = this.settingsRepo.getSettings();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const results: CalendarEvent[] = [];
    const promises: Promise<CalendarEvent[]>[] = [];

    // Fetch Google calendars in parallel
    if (settings.calendarConnections.google) {
      const googleTokens = settings.calendarConnections.google;
      try {
        const visible = settings.visibleCalendars?.google;
        if (visible && visible.length > 0) {
          // Filter out Birthdays calendar
          const validCalIds = visible.filter(
            (calId) => !calId.includes('addressbook#contacts@group.v.calendar.google.com')
          );
          // Fetch all visible calendars in parallel
          const googlePromises = validCalIds.map((calId) =>
            this.fetchGoogleEvents(googleTokens, start, end, calId).catch(
              (err) => {
                logger.warn('Failed to fetch events from Google calendar', { calendarId: calId, error: (err as Error).message });
                return [];
              }
            )
          );
          promises.push(...googlePromises);
        } else {
          // Fallback: if no visible calendars configured, only fetch from primary (user's email)
          const primaryCalendarId = googleTokens.userEmail;
          if (primaryCalendarId) {
            promises.push(
              this.fetchGoogleEvents(googleTokens, start, end, primaryCalendarId).catch(
                (err) => {
                  logger.warn('Failed to fetch primary Google calendar for today', { error: (err as Error).message });
                  return [];
                }
              )
            );
            logger.warn('No visible calendars configured for today; using primary calendar fallback', { primaryCalendarId });
          } else {
            logger.warn('No visible calendars and no primary calendar ID available for today');
          }
        }
      } catch (err) {
        logger.error('Failed to process Google calendar configuration for today', err as Error);
      }
    }

    // Fetch Outlook calendars in parallel
    if (settings.calendarConnections.outlook) {
      promises.push(
        this.fetchOutlookEvents(settings.calendarConnections.outlook, start, end).catch(
          (err) => {
            logger.warn('Failed to fetch Outlook events for today', { error: (err as Error).message });
            return [];
          }
        )
      );
    }

    if (settings.calendarConnections.icloud) {
      logger.warn('iCloud events fetch not yet implemented; returning empty set');
    }

    // Wait for all calendar fetches in parallel
    if (promises.length > 0) {
      const allEvents = await Promise.all(promises);
      for (const events of allEvents) {
        results.push(...events);
      }
    }

    return results.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private persistConnection(provider: 'google' | 'outlook', tokens: OAuthTokens): CalendarConnections {
    const settings = this.settingsRepo.getSettings();
    const connections: CalendarConnections = {
      ...settings.calendarConnections,
      [provider]: tokens,
    };
    this.settingsRepo.updateSettings({ calendarConnections: connections });
    return connections;
  }

  private async runOAuthFlow(config: OAuthConfig): Promise<OAuthTokens> {
    const state = this.randomString(16);
    const codeVerifier = this.randomString(64);
    const codeChallenge = this.toCodeChallenge(codeVerifier);

    let redirectUri = config.redirectUri;
    let waitForCode: Promise<string>;
    let closeRedirect: () => void;

    if (redirectUri && redirectUri.startsWith('treeto://')) {
      const protocolListener = await this.startProtocolListener(state, redirectUri);
      waitForCode = protocolListener.waitForCode;
      closeRedirect = protocolListener.close;
    } else {
      const redirectServer = await this.startRedirectListener(config.provider, state);
      redirectUri = redirectServer.redirectUri;
      waitForCode = redirectServer.waitForCode;
      closeRedirect = redirectServer.close;
    }

    if (!redirectUri) {
      throw new Error('OAuth redirect URI not configured');
    }

    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', config.scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    if (config.extraAuthParams) {
      for (const [key, value] of Object.entries(config.extraAuthParams)) {
        authUrl.searchParams.set(key, value);
      }
    }

    // Dev logging
    if (process.env.NODE_ENV === 'development') {
      logger.info(`[OAuth ${config.provider}] Starting OAuth flow`);
      logger.info(`[OAuth ${config.provider}] Redirect URI: ${redirectUri}`);
    }

    await shell.openExternal(authUrl.toString());
    logger.info('Opened OAuth browser flow', { provider: config.provider });

    const code = await waitForCode;
    closeRedirect();

    // Dev logging
    if (process.env.NODE_ENV === 'development') {
      logger.info(`[OAuth ${config.provider}] Received authorization code`);
    }

    // Exchange code for token via backend (keeps client_secret secure on server)
    const backendEndpoint = this.getBackendAuthEndpoint(config.provider);
    logger.info(`[OAuth ${config.provider}] Exchanging code via backend`, { endpoint: backendEndpoint });

    const tokenResponse = await fetch(backendEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      if (process.env.NODE_ENV === 'development') {
        console.error(`[OAuth ${config.provider}] Token exchange failed:`, errorText);
      }
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenJson = await tokenResponse.json();
    const tokens: OAuthTokens = {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt: tokenJson.expires_in ? Date.now() + tokenJson.expires_in * 1000 : undefined,
      scope: tokenJson.scope,
      tokenType: tokenJson.token_type,
      idToken: tokenJson.id_token,
    };

    // Dev logging
    if (process.env.NODE_ENV === 'development') {
      logger.info(`[OAuth ${config.provider}] ✓ Tokens received successfully via backend`);
      logger.info(`[OAuth ${config.provider}] Expires in: ${tokenJson.expires_in}s`);
    }

    return tokens;
  }

  private getBackendAuthEndpoint(provider: Provider): string {
    const endpoints: Record<Provider, string> = {
      google: `${BACKEND_BASE_URL}/api/auth/google`,
      outlook: `${BACKEND_BASE_URL}/api/auth/outlook`,
      icloud: `${BACKEND_BASE_URL}/api/auth/icloud`,
    };
    return endpoints[provider];
  }

  private async startRedirectListener(provider: Provider, expectedState: string): Promise<{
    redirectUri: string;
    waitForCode: Promise<string>;
    close: () => void;
  }> {
    let resolveCode: (code: string) => void = () => {};
    let rejectCode: (error: Error) => void = () => {};
    const waitForCode = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });

    const server = createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, 'http://127.0.0.1');
      const receivedState = url.searchParams.get('state');
      const code = url.searchParams.get('code');

      if (!code || receivedState !== expectedState) {
        rejectCode(new Error('OAuth callback missing code or state mismatch'));
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<p>Authentication failed. You can close this window.</p>');
        server.close();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<p>Authentication complete. You can close this window.</p>');
      resolveCode(code);
      server.close();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback/${provider}`;

    return {
      redirectUri,
      waitForCode,
      close: () => server.close(),
    };
  }

  private async startProtocolListener(
    expectedState: string,
    redirectUri: string
  ): Promise<{
    waitForCode: Promise<string>;
    close: () => void;
  }> {
    let resolveCode: (code: string) => void = () => {};
    let rejectCode: (error: Error) => void = () => {};
    const waitForCode = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });

    const handler = (url: string) => {
      if (!url.startsWith(redirectUri)) return;

      try {
        const urlObj = new URL(url);
        const receivedState = urlObj.searchParams.get('state');
        const code = urlObj.searchParams.get('code');

        if (!code || receivedState !== expectedState) {
          rejectCode(new Error('OAuth callback missing code or state mismatch'));
          return;
        }

        resolveCode(code);
      } catch (error) {
        rejectCode(error instanceof Error ? error : new Error('Invalid OAuth callback URL'));
      }
    };

    (app.on as any)('treeto-oauth-url', handler);

    return {
      waitForCode,
      close: () => (app.removeListener as any)('treeto-oauth-url', handler),
    };
  }

  private randomString(length: number): string {
    return randomBytes(length).toString('hex').slice(0, length);
  }

  private toCodeChallenge(verifier: string): string {
    const hash = createHash('sha256').update(verifier).digest();
    return hash
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async ensureFreshToken(
    provider: 'google' | 'outlook',
    tokens: OAuthTokens
  ): Promise<OAuthTokens> {
    const needsRefresh = tokens.expiresAt !== undefined && tokens.expiresAt - Date.now() < 60_000;
    if (!needsRefresh || !tokens.refreshToken) return tokens;

    // Deduplicate parallel refresh calls for the same provider
    // Use refresh token as key since it's unique per account
    const cacheKey = `${provider}:${tokens.refreshToken}`;

    const existingPromise = this.tokenRefreshPromises.get(cacheKey);
    if (existingPromise) {
      logger.debug(`[OAuth ${provider}] Reusing in-flight token refresh`);
      return existingPromise;
    }

    // Create the refresh promise and cache it
    const refreshPromise = this.doTokenRefresh(provider, tokens);
    this.tokenRefreshPromises.set(cacheKey, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      // Clean up the cached promise after completion (success or failure)
      this.tokenRefreshPromises.delete(cacheKey);
    }
  }

  /**
   * Actually performs the token refresh with retry logic.
   * Separated from ensureFreshToken to enable deduplication.
   */
  private async doTokenRefresh(
    provider: 'google' | 'outlook',
    tokens: OAuthTokens
  ): Promise<OAuthTokens> {
    // Refresh token via backend (keeps client_secret secure on server)
    const backendEndpoint = this.getBackendAuthEndpoint(provider);
    logger.info(`[OAuth ${provider}] Refreshing token via backend`);

    // Exponential backoff retry logic for rate limiting
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(backendEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();

          // Handle rate limiting (429) with exponential backoff
          if (response.status === 429 && attempt < maxRetries - 1) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
            logger.warn(`[OAuth ${provider}] Rate limited (429). Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries - 1})`);
            await this.sleep(backoffMs);
            continue;
          }

          throw new Error(`Refresh token failed: ${errorText}`);
        }

        const data = await response.json();
        const refreshed: OAuthTokens = {
          ...tokens,
          accessToken: data.access_token,
          expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : tokens.expiresAt,
          scope: data.scope ?? tokens.scope,
          tokenType: data.token_type ?? tokens.tokenType,
        };

        this.persistConnection(provider, refreshed);
        return refreshed;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on specific errors, not all errors
        const errorMessage = lastError.message;
        const isRetryable = errorMessage.includes('Too many requests') ||
                           errorMessage.includes('429') ||
                           errorMessage.includes('ECONNRESET') ||
                           errorMessage.includes('ETIMEDOUT') ||
                           errorMessage.includes('ENOTFOUND');

        if (isRetryable && attempt < maxRetries - 1) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
          logger.warn(`[OAuth ${provider}] Retryable error encountered. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries - 1}): ${lastError.message}`);
          await this.sleep(backoffMs);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error(`Failed to refresh token after ${maxRetries} attempts`);
  }

  private async fetchGoogleEvents(tokens: OAuthTokens, start: Date, end: Date, calendarId: string = 'primary'): Promise<CalendarEvent[]> {
    // Perma-remove Birthdays calendar events
    if (calendarId && calendarId.includes('addressbook#contacts@group.v.calendar.google.com')) {
      return [];
    }

    const freshTokens = await this.ensureFreshToken('google', tokens);

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('timeMin', start.toISOString());
    url.searchParams.set('timeMax', end.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('conferenceDataVersion', '1');

    // Acquire a request slot (throttling)
    await this.acquireRequestSlot();

    // Fetch with exponential backoff retry on rate limiting
    const maxRetries = 3;
    let lastError: Error | null = null;

    try {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${freshTokens.accessToken}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          // Handle 404 - calendar not accessible (likely shared calendar with no access)
          if (response.status === 404) {
            logger.warn(`[Google Calendar API] Calendar not found or not accessible (404) for calendar ${calendarId}. Skipping this calendar.`);
            return [];
          }
          
          // Handle rate limiting (429) with exponential backoff
          if (response.status === 429 && attempt < maxRetries - 1) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
            logger.warn(`[Google Calendar API] Rate limited (429). Retrying in ${backoffMs}ms for calendar ${calendarId} (attempt ${attempt + 1}/${maxRetries - 1})`);
            await this.sleep(backoffMs);
            continue;
          }
          
          throw new Error(`Google events request failed: ${errorText}`);
        }

        const data = await response.json();
        const events: CalendarEvent[] = (data.items || [])
          .filter((item: any) => {
            // Filter out events from the Birthdays calendar by checking organizer
            const organizerEmail = item.organizer?.email || '';
            const creatorEmail = item.creator?.email || '';
            const isBirthdaysCalendar = 
              organizerEmail.includes('addressbook#contacts@group.v.calendar.google.com') ||
              creatorEmail.includes('addressbook#contacts@group.v.calendar.google.com');
            
            // Filter out non-standard event types (outOfOffice, workingLocation, focusTime)
            // Only include events with eventType 'default'
            const eventType = item.eventType || 'default';
            const isStandardEvent = eventType === 'default';
            
            return !isBirthdaysCalendar && isStandardEvent;
          })
          .map((item: any) => {
            // Extract meeting link from conferenceData.entryPoints
            let meetingLink = item.location;
            if (item.conferenceData?.entryPoints) {
              const videoEntry = item.conferenceData.entryPoints.find(
                (entry: any) => entry.entryPointType === 'video'
              );
              if (videoEntry?.uri) {
                meetingLink = videoEntry.uri;
              }
            }
            
            const attendees = item.attendees?.map((a: any) => ({
              email: a.email,
              name: a.displayName,
            })) ?? [];

            return {
              id: item.id,
              title: item.summary || 'Untitled',
              start: new Date(item.start?.dateTime || item.start?.date),
              end: new Date(item.end?.dateTime || item.end?.date || item.start?.dateTime || item.start?.date),
              provider: 'google',
              location: meetingLink,
              attendees,
              description: item.description,
            };
          });

        return events;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Only retry on network-level errors, not on Google API errors
        const errorMessage = lastError.message;
        const isRetryable = errorMessage.includes('429') ||
                           errorMessage.includes('ECONNRESET') ||
                           errorMessage.includes('ETIMEDOUT') ||
                           errorMessage.includes('ENOTFOUND');
        
        if (isRetryable && attempt < maxRetries - 1) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
          logger.warn(`[Google Calendar API] Retryable error for calendar ${calendarId}. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries - 1}): ${lastError.message}`);
          await this.sleep(backoffMs);
          continue;
        }
        
        throw lastError;
      }
    }

    throw lastError || new Error(`Failed to fetch Google events after ${maxRetries} attempts`);
    } finally {
      // Always release the request slot
      this.releaseRequestSlot();
    }
  }

  private async fetchOutlookEvents(tokens: OAuthTokens, start: Date, end: Date): Promise<CalendarEvent[]> {
    const freshTokens = await this.ensureFreshToken('outlook', tokens);

    const url = new URL('https://graph.microsoft.com/v1.0/me/calendarview');
    url.searchParams.set('startdatetime', start.toISOString());
    url.searchParams.set('enddatetime', end.toISOString());
    url.searchParams.set('$orderby', 'start/dateTime');

    // Acquire a request slot (throttling)
    await this.acquireRequestSlot();

    // Fetch with exponential backoff retry on rate limiting
    const maxRetries = 3;
    let lastError: Error | null = null;

    try {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${freshTokens.accessToken}`,
            Prefer: 'outlook.timezone="UTC"',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          
          // Handle rate limiting (429) with exponential backoff
          if (response.status === 429 && attempt < maxRetries - 1) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
            logger.warn(`[Outlook Calendar API] Rate limited (429). Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries - 1})`);
            await this.sleep(backoffMs);
            continue;
          }
          
          throw new Error(`Outlook events request failed: ${errorText}`);
        }

        const data = await response.json();
        const events: CalendarEvent[] = (data.value || [])
          .filter((item: any) => {
            // Filter out non-standard event types (outOfOffice, workingLocation, focusTime)
            // Only include events with type 'default'
            const eventType = item.type || 'default';
            const isStandardEvent = eventType === 'default';
            return isStandardEvent;
          })
          .map((item: any) => {
            // Extract meeting link from onlineMeeting or location
            let meetingLink = item.location?.displayName;
            if (item.onlineMeeting?.joinUrl) {
              meetingLink = item.onlineMeeting.joinUrl;
            } else if (item.isOnlineMeeting && item.onlineMeetingUrl) {
              meetingLink = item.onlineMeetingUrl;
            }
            
            return {
              id: item.id,
              title: item.subject || 'Untitled',
              start: new Date(item.start?.dateTime || item.start),
              end: new Date(item.end?.dateTime || item.end),
              provider: 'outlook',
              location: meetingLink,
              attendees: item.attendees?.map((a: any) => ({
                email: a.emailAddress?.address,
                name: a.emailAddress?.name,
              })) ?? [],
              description: item.bodyPreview,
            };
          });

        return events;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Only retry on network-level errors
        const errorMessage = lastError.message;
        const isRetryable = errorMessage.includes('429') ||
                           errorMessage.includes('ECONNRESET') ||
                           errorMessage.includes('ETIMEDOUT') ||
                           errorMessage.includes('ENOTFOUND');
        
        if (isRetryable && attempt < maxRetries - 1) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 10000);
          logger.warn(`[Outlook Calendar API] Retryable error. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries - 1}): ${lastError.message}`);
          await this.sleep(backoffMs);
          continue;
        }
        
        throw lastError;
      }
    }

    throw lastError || new Error(`Failed to fetch Outlook events after ${maxRetries} attempts`);
    } finally {
      // Always release the request slot
      this.releaseRequestSlot();
    }
  }

  /**
   * Enhanced: Get upcoming meetings for the next 7 days
   * Uses cache first, falls back to fresh fetch
   */
  async getUpcomingMeetings(): Promise<CalendarEvent[]> {
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const results: CalendarEvent[] = [];
    const promises: Promise<CalendarEvent[]>[] = [];

    const settings = this.settingsRepo.getSettings();

    // Fetch Google calendars in parallel
    if (settings.calendarConnections.google) {
      const googleTokens = settings.calendarConnections.google;
      try {
        const visible = settings.visibleCalendars?.google;
        if (visible && visible.length > 0) {
          // Filter out Birthdays calendar
          const validCalIds = visible.filter(
            (calId) => !calId.includes('addressbook#contacts@group.v.calendar.google.com')
          );
          // Fetch all visible calendars in parallel
          const googlePromises = validCalIds.map((calId) =>
            this.fetchGoogleEvents(googleTokens, now, oneWeekFromNow, calId).catch(
              (err) => {
                logger.warn('Failed to fetch events from Google calendar', { calendarId: calId, error: (err as Error).message });
                return [];
              }
            )
          );
          promises.push(...googlePromises);
        } else {
          // Fallback: if no visible calendars configured, only fetch from primary (user's email)
          const primaryCalendarId = googleTokens.userEmail;
          if (primaryCalendarId) {
            promises.push(
              this.fetchGoogleEvents(googleTokens, now, oneWeekFromNow, primaryCalendarId).catch(
                (err) => {
                  logger.warn('Failed to fetch primary Google calendar', { error: (err as Error).message });
                  return [];
                }
              )
            );
            logger.warn('No visible calendars configured; using primary calendar fallback', { primaryCalendarId });
          } else {
            logger.warn('No visible calendars and no primary calendar ID available');
          }
        }
      } catch (err) {
        logger.error('Failed to process Google calendar configuration', err as Error, { provider: 'google' });
      }
    }

    // Fetch Outlook calendars in parallel
    if (settings.calendarConnections.outlook) {
      promises.push(
        this.fetchOutlookEvents(settings.calendarConnections.outlook, now, oneWeekFromNow).catch(
          (err) => {
            logger.warn('Failed to fetch Outlook upcoming events', { error: (err as Error).message });
            return [];
          }
        )
      );
    }

    // Wait for all calendar fetches in parallel
    if (promises.length > 0) {
      const allEvents = await Promise.all(promises);
      for (const events of allEvents) {
        results.push(...events);
      }
    }

    return results.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  async listCalendars(provider: Provider): Promise<Array<{ id: string; name: string }>> {
    const settings = this.settingsRepo.getSettings();
    if (provider === 'google' && settings.calendarConnections.google) {
      const tokens = await this.ensureFreshToken('google', settings.calendarConnections.google);
      const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
      if (!resp.ok) {
        logger.warn('Failed to list google calendars', { status: resp.status });
        return [];
      }
      const data = await resp.json();
      // Filter to show only "My calendars" according to Google Calendar rules:
      // - Include if primary
      // - Include if accessRole is 'owner' or 'writer'
      // - Exclude read-only roles ('reader', 'freeBusyReader')
      // - Optional: respect user's sidebar selection when env flag is set
      const onlySelected = process.env.GOOGLE_CALENDAR_ONLY_SELECTED === 'true';
      const filtered = (data.items || []).filter((c: any) => {
        const role = (c.accessRole as string | undefined) || '';
        const isPrimary = !!c.primary;
        const writable = role === 'owner' || role === 'writer';
        const isBirthdays = typeof c.id === 'string' && c.id.includes('addressbook#contacts@group.v.calendar.google.com');

        // Perma-remove Birthdays calendar from listing
        if (isBirthdays) return false;

        // Always include primary calendar
        if (isPrimary) return onlySelected ? !!c.selected : true;

        // Include writable calendars only (exclude other read-only calendars)
        if (writable) return onlySelected ? !!c.selected : true;

        return false;
      });

      return filtered.map((c: any) => ({ id: c.id, name: c.summary }));
    }
    if (provider === 'outlook' && settings.calendarConnections.outlook) {
      // Optional: implement in future
      return [];
    }
    if (provider === 'icloud' && settings.calendarConnections.icloud) {
      // Optional: implement in future
      return [];
    }
    return [];
  }

  async setVisibleCalendars(provider: Provider, ids: string[]): Promise<void> {
    const settings = this.settingsRepo.getSettings();
    const visible = settings.visibleCalendars || {};
    // Perma-remove Birthdays calendar from visibility selections
    let filteredIds = ids;
    if (provider === 'google') {
      filteredIds = ids.filter((id) => !id.includes('addressbook#contacts@group.v.calendar.google.com'));
    }
    const next = { ...visible, [provider]: filteredIds } as typeof visible;
    this.settingsRepo.updateSettings({ visibleCalendars: next });
    logger.info('Updated visible calendars', { provider, count: filteredIds.length });
  }

  /**
   * Enhanced: Link a calendar event to meeting notes
   * Stores bidirectional mapping
   */
  async linkEventToNotes(
    calendarEventId: string,
    meetingId: string,
    provider: 'google' | 'outlook' | 'icloud'
  ): Promise<void> {
    // Get or create the calendar mappings in settings
    const settings = this.settingsRepo.getSettings();
    const mappings: Record<string, any> = settings.calendarEventMappings || {};
    
    mappings[calendarEventId] = {
      calendarEventId,
      meetingId,
      linkedAt: Date.now(),
      provider,
    };

    // Persist the mapping
    this.settingsRepo.updateSettings({ calendarEventMappings: mappings });
    logger.info('Linked calendar event to notes', { calendarEventId, meetingId, provider });
  }

  /**
   * Enhanced: Get meeting notes link if it exists
   */
  getMeetingNotesLink(calendarEventId: string): string | null {
    const settings = this.settingsRepo.getSettings();
    const mappings = settings.calendarEventMappings || {};
    const mapping = mappings[calendarEventId];
    return mapping?.meetingId || null;
  }

  /**
   * Enhanced: Find calendar event by meeting ID (reverse lookup)
   */
  async findCalendarEventForMeeting(meetingId: string): Promise<CalendarEvent | null> {
    const settings = this.settingsRepo.getSettings();
    const mappings = settings.calendarEventMappings || {};
    
    // Find mapping with this meetingId
    for (const [, mapping] of Object.entries(mappings)) {
      if ((mapping as any).meetingId === meetingId) {
        // Fetch the full event
        const eventId = (mapping as any).calendarEventId;
        const provider = (mapping as any).provider;
        
        if (provider === 'google' && settings.calendarConnections.google) {
          try {
            const events = await this.fetchGoogleEvents(settings.calendarConnections.google, new Date(0), new Date());
            return events.find(e => e.id === eventId) || null;
          } catch (err) {
            logger.error('Failed to fetch Google event', { error: (err as Error).message });
          }
        }
        
        if (provider === 'outlook' && settings.calendarConnections.outlook) {
          try {
            const events = await this.fetchOutlookEvents(settings.calendarConnections.outlook, new Date(0), new Date());
            return events.find(e => e.id === eventId) || null;
          } catch (err) {
            logger.error('Failed to fetch Outlook event', { error: (err as Error).message });
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Fetch person's name from Google People API using their email
   * Returns null if not found or on error
   */
  async fetchPersonNameFromGoogle(email: string): Promise<string | null> {
    const settings = this.settingsRepo.getSettings();
    if (!settings.calendarConnections.google) return null;

    try {
      const tokens = await this.ensureFreshToken('google', settings.calendarConnections.google);

      // Search for person by email using People API
      const url = new URL('https://people.googleapis.com/v1/people:searchContacts');
      url.searchParams.set('query', email);
      url.searchParams.set('readMask', 'names,emailAddresses');

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });

      if (!response.ok) {
        logger.debug('People API search failed', { email, status: response.status });
        return null;
      }

      const data = await response.json();
      const results = data.results || [];
      
      if (results.length > 0 && results[0].person?.names?.[0]?.displayName) {
        const displayName = results[0].person.names[0].displayName;
        logger.info('Fetched name from People API', { email, name: displayName });
        return displayName;
      }

      return null;
    } catch (error) {
      logger.debug('Failed to fetch person from People API', { email, error: (error as Error).message });
      return null;
    }
  }

  /**
   * Get a calendar event by ID (for recording lifecycle)
   * Returns full event details with all metadata
   */
  async getEventById(eventId: string): Promise<CalendarEvent | null> {
    const settings = this.settingsRepo.getSettings();
    const mappings = settings.calendarEventMappings || {};
    const mapping = mappings[eventId];
    const provider = mapping?.provider || 'google';

    // Try to fetch from the provider
    if (provider === 'google' && settings.calendarConnections.google) {
      try {
        const events = await this.fetchGoogleEvents(settings.calendarConnections.google, new Date(0), new Date());
        const event = events.find(e => e.id === eventId);
        if (event) return event;
      } catch (err) {
        logger.debug('Failed to fetch Google event by ID', { eventId, error: (err as Error).message });
      }
    }

    if (provider === 'outlook' && settings.calendarConnections.outlook) {
      try {
        const events = await this.fetchOutlookEvents(settings.calendarConnections.outlook, new Date(0), new Date());
        const event = events.find(e => e.id === eventId);
        if (event) return event;
      } catch (err) {
        logger.debug('Failed to fetch Outlook event by ID', { eventId, error: (err as Error).message });
      }
    }

    return null;
  }

  /**
   * Fetch all events within a date range for contact syncing
   * Used to populate People from calendar attendees (past and future events)
   */
  async fetchEventsInRange(start: Date, end: Date): Promise<CalendarEvent[]> {
    const settings = this.settingsRepo.getSettings();
    const results: CalendarEvent[] = [];

    if (settings.calendarConnections.google) {
      try {
        const visible = settings.visibleCalendars?.google;
        if (visible && visible.length > 0) {
          for (const calId of visible) {
            if (calId.includes('addressbook#contacts@group.v.calendar.google.com')) continue;
            const events = await this.fetchGoogleEvents(settings.calendarConnections.google, start, end, calId);
            results.push(...events);
          }
        } else {
          const events = await this.fetchGoogleEvents(settings.calendarConnections.google, start, end);
          results.push(...events);
        }
      } catch (err) {
        logger.error('Failed to fetch Google events for range', { error: (err as Error).message });
      }
    }

    if (settings.calendarConnections.outlook) {
      try {
        const events = await this.fetchOutlookEvents(settings.calendarConnections.outlook, start, end);
        results.push(...events);
      } catch (err) {
        logger.error('Failed to fetch Outlook events for range', { error: (err as Error).message });
      }
    }

    return results;
  }

  /**
   * Link notes to a calendar event after recording completes
   * Attempts write-back to calendar, persists locally as fallback
   */
  async linkNotesToEvent(calendarEventId: string, notesId: string, provider: 'google' | 'outlook' | 'icloud'): Promise<void> {
    logger.info('Linking notes to calendar event', { calendarEventId, notesId, provider });

    // Update local mapping first (always succeeds)
    const settings = this.settingsRepo.getSettings();
    const mappings: Record<string, any> = settings.calendarEventMappings || {};
    
    if (mappings[calendarEventId]) {
      mappings[calendarEventId].notesId = notesId;
    } else {
      mappings[calendarEventId] = {
        calendarEventId,
        notesId,
        linkedAt: Date.now(),
        provider,
      };
    }

    this.settingsRepo.updateSettings({ calendarEventMappings: mappings });
    logger.info('Notes linked locally to calendar event', { calendarEventId, notesId });

    // Attempt write-back to calendar (best effort, doesn't fail the whole operation)
    try {
      if (provider === 'google' && settings.calendarConnections.google) {
        // Note: Google Calendar API requires specific scope for updating events
        // This is read-only by design. Persist locally and skip write-back.
        logger.debug('Skipping Google Calendar write-back (read-only scope)', { calendarEventId });
      } else if (provider === 'outlook' && settings.calendarConnections.outlook) {
        // Outlook also has strict scope requirements for updates
        logger.debug('Skipping Outlook Calendar write-back (read-only scope)', { calendarEventId });
      }
    } catch (err) {
      logger.warn('Failed to write notes link back to calendar (using local fallback)', {
        calendarEventId,
        error: (err as Error).message,
      });
    }
  }
}



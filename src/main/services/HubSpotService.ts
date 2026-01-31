import axios from 'axios';
import { Client } from '@hubspot/api-client';
import { createLogger } from '../core/logger';
import type { HubSpotOAuthToken } from '../providers/HubSpotOAuthProvider';
import { BACKEND_BASE_URL } from '../providers/BackendAPIProvider';

const logger = createLogger('HubSpotService');

export interface ContactSearchResult {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export class HubSpotService {
  private clientId: string;
  private redirectUri: string;
  private authorizationUrl = 'https://app.hubspot.com/oauth/authorize';

  constructor(
    clientId: string = process.env.HUBSPOT_CLIENT_ID || '',
    redirectUri: string = 'http://localhost:3000/oauth/hubspot'
  ) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;

    if (!this.clientId) {
      logger.warn('HubSpot client ID not configured');
    }
  }

  /**
   * Generate the HubSpot OAuth authorization URL
   * User opens this in browser to grant permission
   */
  public getAuthorizationUrl(state?: string): string {
    const scopes = [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      response_type: 'code',
      ...(state && { state }),
    });

    const url = `${this.authorizationUrl}?${params.toString()}`;
    logger.info('Generated HubSpot authorization URL', {
      scopes: scopes.split(' '),
      redirectUri: this.redirectUri,
    });

    return url;
  }

  /**
   * Exchange authorization code for access token via backend
   * Called after user authorizes in browser and redirects back with 'code'
   */
  public async exchangeCodeForToken(code: string): Promise<HubSpotOAuthToken> {
    try {
      if (!this.clientId) {
        throw new Error('HubSpot client ID not configured');
      }

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

      if (!access_token) {
        throw new Error('No access token in response from backend');
      }

      const token: HubSpotOAuthToken = {
        accessToken: access_token,
        refreshToken: refresh_token || '',
        expiresAt: Date.now() + expires_in * 1000,
        connectedAt: Date.now(),
      };

      logger.info('Successfully exchanged code for token via backend', {
        expiresIn: expires_in,
        hasRefreshToken: !!refresh_token,
      });

      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to exchange code for token', { error: message });
      throw new Error(`Failed to exchange HubSpot authorization code: ${message}`);
    }
  }

  /**
   * Refresh an expired access token using refresh token via backend
   */
  public async refreshAccessToken(refreshToken: string): Promise<HubSpotOAuthToken> {
    try {
      // Refresh token via backend (keeps client_secret secure on server)
      const backendEndpoint = `${BACKEND_BASE_URL}/api/auth/hubspot`;
      logger.info('Refreshing token via backend');

      const response = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${errorText}`);
      }

      const data = await response.json();
      const { access_token, refresh_token, expires_in } = data;

      const token: HubSpotOAuthToken = {
        accessToken: access_token,
        refreshToken: refresh_token || refreshToken, // Use old one if new one not provided
        expiresAt: Date.now() + expires_in * 1000,
        connectedAt: Date.now(),
      };

      logger.info('Successfully refreshed access token via backend', { expiresIn: expires_in });

      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to refresh access token', { error: message });
      throw new Error(`Failed to refresh HubSpot token: ${message}`);
    }
  }

  /**
   * Check if token is expired (with 5-minute buffer)
   */
  public isTokenExpired(token: HubSpotOAuthToken, bufferMs: number = 5 * 60 * 1000): boolean {
    return Date.now() > token.expiresAt - bufferMs;
  }

  /**
   * Search for a HubSpot contact by email
   */
  public async searchContactByEmail(
    email: string,
    accessToken: string
  ): Promise<ContactSearchResult | null> {
    try {
      logger.debug('Searching HubSpot contact by email', { email });

      const response = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/contacts/search',
        {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'email',
                  operator: 'EQ',
                  value: email,
                },
              ],
            },
          ],
          properties: ['firstname', 'lastname', 'email'],
          limit: 1,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.data.results || response.data.results.length === 0) {
        logger.debug('No HubSpot contact found for email', { email });
        return null;
      }

      const contact = response.data.results[0];
      const result: ContactSearchResult = {
        id: contact.id,
        email: contact.properties?.email || email,
        firstName: contact.properties?.firstname,
        lastName: contact.properties?.lastname,
        name: [contact.properties?.firstname, contact.properties?.lastname]
          .filter(Boolean)
          .join(' ') || undefined,
      };

      logger.info('Found HubSpot contact', {
        email,
        contactId: contact.id,
        name: result.name,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to search HubSpot contact', { email, error: message });
      throw new Error(`Failed to search HubSpot contact: ${message}`);
    }
  }

  /**
   * Search for multiple contacts by emails
   */
  public async searchContactsByEmails(
    emails: string[],
    accessToken: string
  ): Promise<ContactSearchResult[]> {
    const results: ContactSearchResult[] = [];

    for (const email of emails) {
      try {
        const contact = await this.searchContactByEmail(email, accessToken);
        if (contact) {
          results.push(contact);
        }
      } catch (err) {
        logger.warn('Failed to search for individual contact', {
          email,
          error: err instanceof Error ? err.message : 'Unknown',
        });
        // Continue with next email on individual error
      }
    }

    return results;
  }

  /**
   * Create or get a note object
   */
  public async createNote(
    noteBody: string,
    accessToken: string
  ): Promise<string> {
    try {
      logger.debug('Creating HubSpot note');

      const response = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/notes',
        {
          properties: {
            hsnotebody: noteBody,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const noteId = response.data.id;
      logger.info('Created HubSpot note', { noteId });

      return noteId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create HubSpot note', { error: message });
      throw new Error(`Failed to create HubSpot note: ${message}`);
    }
  }

  /**
   * Associate a note to a contact
   */
  public async associateNoteToContact(
    noteId: string,
    contactId: string,
    accessToken: string
  ): Promise<void> {
    try {
      logger.debug('Associating note to contact', { noteId, contactId });

      await axios.put(
        `https://api.hubapi.com/crm/v3/objects/notes/${noteId}/associations/contacts/${contactId}/notetocontact`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('Associated note to contact', { noteId, contactId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to associate note to contact', { noteId, contactId, error: message });
      throw new Error(`Failed to associate note to contact: ${message}`);
    }
  }

  /**
   * Get HubSpot API client (for advanced operations)
   * Use this if you need to do more complex operations
   */
  public getApiClient(accessToken: string): Client {
    const client = new Client({ accessToken });
    return client;
  }
}

import axios from 'axios';
import { Client } from '@hubspot/api-client';
import { createLogger } from '../core/logger';
import type { HubSpotOAuthToken } from '../providers/HubSpotOAuthProvider';
import { BACKEND_BASE_URL } from '../providers/BackendAPIProvider';
import type { CRMSnapshot, CRMEmailActivity, CRMNote, CRMContactData } from '@shared/types';

const logger = createLogger('HubSpotService');

export interface ContactSearchResult {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface HubSpotDeal {
  id: string;
  name: string;
  stage: string;
  amount?: number;
  closeDate?: string;
  pipeline?: string;
}

export interface HubSpotEngagement {
  id: string;
  type: 'EMAIL' | 'NOTE' | 'CALL' | 'MEETING' | 'TASK';
  timestamp: number;
  subject?: string;
  body?: string;
  direction?: 'INBOUND' | 'OUTBOUND';
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
   * Search for a HubSpot contact by name (firstname or lastname contains)
   * Used when we don't have an email but have a person's name from the conversation
   */
  public async searchContactByName(
    name: string,
    accessToken: string
  ): Promise<ContactSearchResult | null> {
    try {
      logger.debug('Searching HubSpot contact by name', { name });

      // Split name into parts for better matching
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Build filter groups - search by firstname OR lastname containing the name parts
      const filterGroups: Array<{ filters: Array<{ propertyName: string; operator: string; value: string }> }> = [];

      // If we have a full name, try exact match first
      if (firstName && lastName) {
        filterGroups.push({
          filters: [
            { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: firstName },
            { propertyName: 'lastname', operator: 'CONTAINS_TOKEN', value: lastName },
          ],
        });
      }

      // Also try matching full name in either field
      filterGroups.push({
        filters: [
          { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: name.split(' ')[0] },
        ],
      });

      if (lastName) {
        filterGroups.push({
          filters: [
            { propertyName: 'lastname', operator: 'CONTAINS_TOKEN', value: lastName },
          ],
        });
      }

      const response = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/contacts/search',
        {
          filterGroups,
          properties: ['firstname', 'lastname', 'email', 'jobtitle'],
          limit: 5, // Get a few results in case of multiple matches
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.data.results || response.data.results.length === 0) {
        logger.debug('No HubSpot contact found for name', { name });
        return null;
      }

      // Find best match - prefer exact name match
      const contacts = response.data.results;
      let bestMatch = contacts[0];

      for (const contact of contacts) {
        const contactName = [contact.properties?.firstname, contact.properties?.lastname]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (contactName === name.toLowerCase()) {
          bestMatch = contact;
          break;
        }
      }

      const result: ContactSearchResult = {
        id: bestMatch.id,
        email: bestMatch.properties?.email || '',
        firstName: bestMatch.properties?.firstname,
        lastName: bestMatch.properties?.lastname,
        name: [bestMatch.properties?.firstname, bestMatch.properties?.lastname]
          .filter(Boolean)
          .join(' ') || undefined,
      };

      logger.info('Found HubSpot contact by name', {
        searchName: name,
        contactId: bestMatch.id,
        foundName: result.name,
        email: result.email,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to search HubSpot contact by name', { name, error: message });
      return null; // Return null instead of throwing - name search is a fallback
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
            hs_note_body: noteBody,
            hs_timestamp: Date.now(),
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
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const data = axios.isAxiosError(error) ? error.response?.data : undefined;
      logger.error('Failed to create HubSpot note', { error: message, status, data });
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

  /**
   * Get deals associated with a contact
   */
  public async getDealsForContact(
    contactId: string,
    accessToken: string
  ): Promise<HubSpotDeal[]> {
    try {
      logger.debug('Fetching HubSpot deals for contact', { contactId });

      // First, get deal associations for the contact
      const assocResponse = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/deals`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const dealIds = assocResponse.data.results?.map((r: { id: string }) => r.id) || [];

      if (dealIds.length === 0) {
        logger.debug('No deals associated with contact', { contactId });
        return [];
      }

      // Fetch deal details
      const deals: HubSpotDeal[] = [];
      for (const dealId of dealIds.slice(0, 5)) { // Limit to 5 deals
        try {
          const dealResponse = await axios.get(
            `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
            {
              params: {
                properties: 'dealname,dealstage,amount,closedate,pipeline',
              },
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );

          const props = dealResponse.data.properties;
          deals.push({
            id: dealId,
            name: props.dealname || 'Unnamed Deal',
            stage: props.dealstage || 'Unknown',
            amount: props.amount ? parseFloat(props.amount) : undefined,
            closeDate: props.closedate || undefined,
            pipeline: props.pipeline || undefined,
          });
        } catch (err) {
          logger.warn('Failed to fetch deal details', { dealId, error: err });
        }
      }

      logger.info('Fetched HubSpot deals for contact', { contactId, count: deals.length });
      return deals;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch deals for contact', { contactId, error: message });
      return [];
    }
  }

  /**
   * Get engagements (emails, notes, calls) for a contact
   */
  public async getEngagementsForContact(
    contactId: string,
    accessToken: string,
    limit: number = 20
  ): Promise<HubSpotEngagement[]> {
    try {
      logger.debug('Fetching HubSpot engagements for contact', { contactId });

      // Get engagement associations
      const assocResponse = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/engagements`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const engagementIds = assocResponse.data.results?.map((r: { id: string }) => r.id) || [];

      if (engagementIds.length === 0) {
        logger.debug('No engagements for contact', { contactId });
        return [];
      }

      // Fetch engagement details using the engagements API
      const engagements: HubSpotEngagement[] = [];
      for (const engId of engagementIds.slice(0, limit)) {
        try {
          const engResponse = await axios.get(
            `https://api.hubapi.com/engagements/v1/engagements/${engId}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );

          const eng = engResponse.data;
          const engType = eng.engagement?.type;
          const metadata = eng.metadata || {};

          engagements.push({
            id: engId,
            type: engType,
            timestamp: eng.engagement?.timestamp || Date.now(),
            subject: metadata.subject || metadata.title || undefined,
            body: metadata.body || metadata.text || undefined,
            direction: metadata.direction || undefined,
          });
        } catch (err) {
          // Skip failed engagements
        }
      }

      // Sort by timestamp descending
      engagements.sort((a, b) => b.timestamp - a.timestamp);

      logger.info('Fetched HubSpot engagements', { contactId, count: engagements.length });
      return engagements;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch engagements', { contactId, error: message });
      return [];
    }
  }

  /**
   * Get comprehensive contact data including deals, emails, and notes
   * This is the main method for prep data collection
   */
  public async getContactData(
    email: string,
    accessToken: string
  ): Promise<CRMContactData | null> {
    try {
      // First, find the contact
      const contact = await this.searchContactByEmail(email, accessToken);
      if (!contact) {
        logger.debug('Contact not found in HubSpot', { email });
        return null;
      }

      // Fetch deals and engagements in parallel
      const [deals, engagements] = await Promise.all([
        this.getDealsForContact(contact.id, accessToken),
        this.getEngagementsForContact(contact.id, accessToken),
      ]);

      // Transform deals to CRMSnapshot format
      const crmDeals: CRMSnapshot[] = deals.map(deal => ({
        dealId: deal.id,
        dealName: deal.name,
        dealValue: deal.amount,
        dealStage: deal.stage,
        closeDate: deal.closeDate,
        source: 'hubspot' as const,
      }));

      // Separate emails and notes from engagements
      const emails: CRMEmailActivity[] = engagements
        .filter(e => e.type === 'EMAIL')
        .map(e => ({
          id: e.id,
          subject: e.subject || 'No Subject',
          snippet: e.body ? e.body.substring(0, 200) : undefined,
          date: new Date(e.timestamp).toISOString(),
          direction: e.direction === 'INBOUND' ? 'inbound' as const : 'outbound' as const,
          source: 'hubspot' as const,
        }));

      const notes: CRMNote[] = engagements
        .filter(e => e.type === 'NOTE')
        .map(e => ({
          id: e.id,
          content: e.body || '',
          date: new Date(e.timestamp).toISOString(),
          source: 'hubspot' as const,
        }));

      // Find last activity date
      const lastActivityDate = engagements.length > 0
        ? new Date(engagements[0].timestamp).toISOString()
        : undefined;

      const contactData: CRMContactData = {
        contactId: contact.id,
        email: contact.email,
        name: contact.name,
        source: 'hubspot',
        deals: crmDeals,
        emails,
        notes,
        lastActivityDate,
      };

      logger.info('Fetched comprehensive HubSpot contact data', {
        email,
        deals: crmDeals.length,
        emails: emails.length,
        notes: notes.length,
      });

      return contactData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to fetch comprehensive contact data', { email, error: message });
      return null;
    }
  }

  /**
   * Get deal stage name from pipeline (for display)
   */
  public async getDealStageName(
    stageId: string,
    pipelineId: string,
    accessToken: string
  ): Promise<string> {
    try {
      const response = await axios.get(
        `https://api.hubapi.com/crm/v3/pipelines/deals/${pipelineId}/stages`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const stage = response.data.results?.find((s: { id: string }) => s.id === stageId);
      return stage?.label || stageId;
    } catch (error) {
      return stageId; // Return raw ID if lookup fails
    }
  }
}

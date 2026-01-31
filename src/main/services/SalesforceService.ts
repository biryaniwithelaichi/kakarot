import * as jsforce from 'jsforce';
import crypto from 'crypto';
import { createLogger } from '../core/logger';
import { BACKEND_BASE_URL } from '../providers/BackendAPIProvider';

const logger = createLogger('SalesforceService');

export interface SalesforceOAuthToken {
  accessToken: string;
  refreshToken?: string;
  instanceUrl: string;
  expiresAt?: number;
  connectedAt: number;
}

export interface ContactSearchResult {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  type: 'Contact' | 'Lead';
}

export class SalesforceService {
  private clientId: string;
  private redirectUri: string;
  private codeVerifier: string | null = null;

  constructor(
    clientId: string = process.env.SALESFORCE_CLIENT_ID || '',
    redirectUri: string = 'http://localhost:3000/oauth/salesforce'
  ) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;

    if (!this.clientId) {
      logger.warn('Salesforce client ID not configured');
    }
  }

  /**
   * Generate code verifier and challenge for PKCE
   */
  private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    // Generate a random code verifier (43-128 characters)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    // Generate code challenge (SHA256 hash of verifier)
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Generate the Salesforce OAuth authorization URL
   * User opens this in browser to grant permission
   */
  public getAuthorizationUrl(state?: string): string {
    // Scopes: api, refresh_token, id, profile, email
    const scopes = ['api', 'refresh_token', 'id', 'profile', 'email'];

    // Generate PKCE parameters
    const { codeVerifier, codeChallenge } = this.generatePKCE();
    this.codeVerifier = codeVerifier;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...(state && { state }),
    });

    const url = `https://login.salesforce.com/services/oauth2/authorize?${params.toString()}`;

    logger.info('Generated Salesforce authorization URL with PKCE', {
      scopes,
      redirectUri: this.redirectUri,
      codeChallenge: codeChallenge.substring(0, 10) + '...',
    });

    return url;
  }

  /**
   * Exchange authorization code for access token via backend
   * Called after user authorizes in browser and redirects back with 'code'
   */
  public async exchangeCodeForToken(code: string): Promise<SalesforceOAuthToken> {
    try {
      if (!this.clientId) {
        throw new Error('Salesforce client ID not configured');
      }

      if (!this.codeVerifier) {
        throw new Error('Code verifier not found - authorization flow not started properly');
      }

      // Exchange code for token via backend (keeps client_secret secure on server)
      const backendEndpoint = `${BACKEND_BASE_URL}/api/auth/salesforce`;
      logger.info('Exchanging code via backend', { endpoint: backendEndpoint });

      const response = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirect_uri: this.redirectUri,
          code_verifier: this.codeVerifier,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const data = await response.json();
      const { access_token, refresh_token, instance_url } = data;

      if (!access_token) {
        throw new Error('No access token received from backend');
      }

      const token: SalesforceOAuthToken = {
        accessToken: access_token,
        refreshToken: refresh_token || undefined,
        instanceUrl: instance_url,
        connectedAt: Date.now(),
      };

      // Clear the code verifier after use
      this.codeVerifier = null;

      logger.info('Successfully exchanged code for token via backend', {
        instanceUrl: instance_url,
        hasRefreshToken: !!refresh_token,
      });

      return token;
    } catch (error) {
      this.codeVerifier = null; // Clear on error
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to exchange code for token', { error: message });
      throw new Error(`Failed to exchange Salesforce authorization code: ${message}`);
    }
  }

  /**
   * Refresh an expired access token using refresh token via backend
   */
  public async refreshAccessToken(
    refreshToken: string,
    instanceUrl: string
  ): Promise<SalesforceOAuthToken> {
    try {
      // Refresh token via backend (keeps client_secret secure on server)
      const backendEndpoint = `${BACKEND_BASE_URL}/api/auth/salesforce`;
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
      const { access_token, refresh_token, instance_url } = data;

      if (!access_token) {
        throw new Error('No access token received after refresh');
      }

      const token: SalesforceOAuthToken = {
        accessToken: access_token,
        refreshToken: refresh_token || refreshToken,
        instanceUrl: instance_url || instanceUrl,
        connectedAt: Date.now(),
      };

      logger.info('Successfully refreshed access token via backend');

      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to refresh access token', { error: message });
      throw new Error(`Failed to refresh Salesforce token: ${message}`);
    }
  }

  /**
   * Search for a Salesforce contact by email
   * Searches both Contacts and Leads
   */
  public async searchContactByEmail(
    email: string,
    accessToken: string,
    instanceUrl: string
  ): Promise<ContactSearchResult | null> {
    try {
      logger.debug('Searching Salesforce contact/lead by email', { email });

      const conn = new jsforce.Connection({
        accessToken,
        instanceUrl,
      });

      // Search in Contacts first
      const contactResults = await conn.sobject('Contact').find<{
        Id: string;
        Email: string;
        FirstName?: string;
        LastName?: string;
        Name?: string;
      }>(
        { Email: email },
        { Id: 1, Email: 1, FirstName: 1, LastName: 1, Name: 1 }
      ).limit(1).execute();

      if (contactResults.length > 0) {
        const contact = contactResults[0];
        const result: ContactSearchResult = {
          id: contact.Id,
          email: contact.Email || email,
          firstName: contact.FirstName,
          lastName: contact.LastName,
          name: contact.Name,
          type: 'Contact',
        };

        logger.info('Found Salesforce Contact', {
          email,
          contactId: contact.Id,
          name: result.name,
        });

        return result;
      }

      // If not found in Contacts, search in Leads
      const leadResults = await conn.sobject('Lead').find<{
        Id: string;
        Email: string;
        FirstName?: string;
        LastName?: string;
        Name?: string;
      }>(
        { Email: email },
        { Id: 1, Email: 1, FirstName: 1, LastName: 1, Name: 1 }
      ).limit(1).execute();

      if (leadResults.length > 0) {
        const lead = leadResults[0];
        const result: ContactSearchResult = {
          id: lead.Id,
          email: lead.Email || email,
          firstName: lead.FirstName,
          lastName: lead.LastName,
          name: lead.Name,
          type: 'Lead',
        };

        logger.info('Found Salesforce Lead', {
          email,
          leadId: lead.Id,
          name: result.name,
        });

        return result;
      }

      logger.debug('No Salesforce contact or lead found for email', { email });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to search Salesforce contact', { email, error: message });
      throw new Error(`Failed to search Salesforce contact: ${message}`);
    }
  }

  /**
   * Search for multiple contacts by emails
   */
  public async searchContactsByEmails(
    emails: string[],
    accessToken: string,
    instanceUrl: string
  ): Promise<ContactSearchResult[]> {
    const results: ContactSearchResult[] = [];

    for (const email of emails) {
      try {
        const contact = await this.searchContactByEmail(email, accessToken, instanceUrl);
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
   * Create a Task (note) in Salesforce
   */
  public async createTask(
    subject: string,
    description: string,
    accessToken: string,
    instanceUrl: string
  ): Promise<string> {
    try {
      logger.debug('Creating Salesforce task');

      const conn = new jsforce.Connection({
        accessToken,
        instanceUrl,
      });

      const result = await conn.sobject('Task').create({
        Subject: subject,
        Description: description,
        Status: 'Completed',
        ActivityDate: new Date().toISOString().split('T')[0], // Today's date
      });

      if (!result.success) {
        throw new Error('Failed to create task: ' + JSON.stringify(result.errors));
      }

      const taskId = result.id;
      logger.info('Created Salesforce task', { taskId });

      return taskId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create Salesforce task', { error: message });
      throw new Error(`Failed to create Salesforce task: ${message}`);
    }
  }

  /**
   * Associate a Task to a Contact or Lead
   */
  public async associateTaskToContact(
    taskId: string,
    contactId: string,
    accessToken: string,
    instanceUrl: string
  ): Promise<void> {
    try {
      logger.debug('Associating task to contact/lead', { taskId, contactId });

      const conn = new jsforce.Connection({
        accessToken,
        instanceUrl,
      });

      // Update the task with WhoId (Contact or Lead)
      await conn.sobject('Task').update({
        Id: taskId,
        WhoId: contactId,
      });

      logger.info('Associated task to contact/lead', { taskId, contactId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to associate task to contact', { taskId, contactId, error: message });
      throw new Error(`Failed to associate task to contact: ${message}`);
    }
  }

  /**
   * Get Salesforce connection (for advanced operations)
   * Use this if you need to do more complex operations
   */
  public getConnection(accessToken: string, instanceUrl: string): jsforce.Connection {
    return new jsforce.Connection({
      accessToken,
      instanceUrl,
    });
  }
}

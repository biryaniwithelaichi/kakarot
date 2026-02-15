import { SalesforceOAuthToken } from '../providers/SalesforceOAuthProvider';
import { HubSpotOAuthToken } from '../providers/HubSpotOAuthProvider';
import { createLogger } from '../core/logger';
import { getContainer } from '../core/container';

const logger = createLogger('CRMEmailMatcher');

export interface ContactMatch {
  email: string;
  crmId: string;
  crmName: string;
  provider: 'salesforce' | 'hubspot';
}

export class CRMEmailMatcher {
  /**
   * Find Salesforce contacts matching participant emails
   */
  async findSalesforceContacts(emails: string[], token: SalesforceOAuthToken): Promise<ContactMatch[]> {
    try {
      const { salesforceService } = getContainer();
      const matches: ContactMatch[] = [];

      const results = await salesforceService.searchContactsByEmails(
        emails,
        token.accessToken,
        token.instanceUrl
      );

      for (const result of results) {
        matches.push({
          email: result.email,
          crmId: result.id,
          crmName: result.name || result.email,
          provider: 'salesforce',
        });
      }

      return matches;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to find Salesforce contacts', { error: message });
      throw new Error(`Failed to find Salesforce contacts: ${message}`);
    }
  }

  /**
   * Find HubSpot contacts matching participant emails using official search API
   */
  async findHubSpotContacts(emails: string[], token: HubSpotOAuthToken): Promise<ContactMatch[]> {
    try {
      const { hubSpotService } = getContainer();
      const matches: ContactMatch[] = [];

      const results = await hubSpotService.searchContactsByEmails(emails, token.accessToken);

      for (const result of results) {
        matches.push({
          email: result.email,
          crmId: result.id,
          crmName: result.name || result.email,
          provider: 'hubspot',
        });
      }

      return matches;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to find HubSpot contacts', { error: message });
      throw new Error(`Failed to find HubSpot contacts: ${message}`);
    }
  }

  /**
   * Match multiple emails against a CRM
   */
  async matchEmailsToCRM(
    emails: string[],
    provider: 'salesforce' | 'hubspot',
    token: SalesforceOAuthToken | HubSpotOAuthToken
  ): Promise<ContactMatch[]> {
    if (provider === 'salesforce') {
      return this.findSalesforceContacts(emails, token as SalesforceOAuthToken);
    } else {
      return this.findHubSpotContacts(emails, token as HubSpotOAuthToken);
    }
  }
}

import * as jsforce from 'jsforce';
import crypto from 'crypto';
import { createLogger } from '../core/logger';
import { BACKEND_BASE_URL } from '../providers/BackendAPIProvider';
import type { CRMSnapshot, CRMEmailActivity, CRMNote, CRMContactData } from '@shared/types';

const logger = createLogger('SalesforceService');

// --- Interfaces ---

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

/**
 * Context for Meeting Prep
 * Includes the Company (Account) details and any open Deals (Opportunities)
 */
export interface SalesforceContext {
  account?: {
    Name: string;
    Industry?: string;
    Website?: string;
  };
  opportunities: Array<{
    Name: string;
    StageName: string;
    Amount?: number;
    CloseDate: string;
  }>;
}

// --- Service Class ---

export class SalesforceService {
  private clientId: string;
  private redirectUri: string;
  private codeVerifier: string | null = null;

  constructor(
    // ✅ FIXED: Hardcoded Consumer Key to resolve "invalid_client_id"
    clientId: string = '3MVG9rZjd7MXFdLgBktz_5oACAAZtV8Ivsn5B57QngtICKtZ_xNj8DD16Al4qkJrg8K3gEOF.qRMnuPE0waK9',
    redirectUri: string = 'http://localhost:3000/oauth/salesforce'
  ) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
  }

  /**
   * 1. Generate code verifier and challenge for PKCE (Security)
   */
  private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  /**
   * 2. Get the Authorization URL
   * Opens in the user's browser
   */
  public getAuthorizationUrl(state?: string): string {
    const scopes = ['api', 'refresh_token', 'id', 'profile', 'email'];
    const { codeVerifier, codeChallenge } = this.generatePKCE();
    
    // Store verifier locally to send to backend later
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
    
    logger.info('Generated Salesforce authorization URL', { redirectUri: this.redirectUri });
    return url;
  }

  /**
   * 3. Exchange Code for Token (via Treeto Backend)
   * Keeps Client Secret secure on the server
   */
  public async exchangeCodeForToken(code: string): Promise<SalesforceOAuthToken> {
    try {
      if (!this.codeVerifier) {
        throw new Error('Code verifier not found - authorization flow not started properly');
      }

      const backendEndpoint = `${BACKEND_BASE_URL}/api/auth/salesforce`;
      logger.info('Exchanging code via backend', { endpoint: backendEndpoint });

      const response = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirect_uri: this.redirectUri,
          code_verifier: this.codeVerifier, // Send PKCE password to backend
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend token exchange failed: ${errorText}`);
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

      this.codeVerifier = null; // Cleanup
      return token;

    } catch (error) {
      this.codeVerifier = null;
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to exchange code for token', { error: message });
      throw new Error(`Salesforce Login Failed: ${message}`);
    }
  }

  /**
   * 4. Refresh Token (via Treeto Backend)
   */
  public async refreshAccessToken(
    refreshToken: string,
    instanceUrl: string
  ): Promise<SalesforceOAuthToken> {
    try {
      const backendEndpoint = `${BACKEND_BASE_URL}/api/auth/salesforce`;
      
      const response = await fetch(backendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken, // Backend handles the Client Secret
        }),
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        instanceUrl: data.instance_url || instanceUrl,
        connectedAt: Date.now(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to refresh access token', { error: message });
      throw new Error(`Failed to refresh Salesforce token: ${message}`);
    }
  }

  /**
   * 5. Search for Contact/Lead by Email
   * ✅ FIXED: Explicit casting to 'string' to solve TypeScript errors
   */
  public async searchContactByEmail(
    email: string,
    accessToken: string,
    instanceUrl: string
  ): Promise<ContactSearchResult | null> {
    try {
      const conn = new jsforce.Connection({ accessToken, instanceUrl });

      // Search Contacts
      const contacts = await conn.sobject('Contact')
        .find({ Email: email }, { Id: 1, Email: 1, FirstName: 1, LastName: 1, Name: 1 })
        .limit(1)
        .execute();

      if (contacts.length > 0) {
        const c = contacts[0];
        return {
          id: c.Id as string,
          email: (c.Email || email) as string,
          firstName: c.FirstName ?? undefined,
          lastName: c.LastName ?? undefined,
          name: c.Name ?? undefined,
          type: 'Contact',
        };
      }

      // Search Leads
      const leads = await conn.sobject('Lead')
        .find({ Email: email }, { Id: 1, Email: 1, FirstName: 1, LastName: 1, Name: 1 })
        .limit(1)
        .execute();

      if (leads.length > 0) {
        const l = leads[0];
        return {
          id: l.Id as string,
          email: (l.Email || email) as string,
          firstName: l.FirstName ?? undefined,
          lastName: l.LastName ?? undefined,
          name: l.Name ?? undefined,
          type: 'Lead',
        };
      }

      return null;
    } catch (error) {
      logger.error('Salesforce search failed', { email, error });
      throw error;
    }
  }

  /**
   * 6. DEEP SCRAPE: Get Company & Deal Context
   * Retrieves Account info and open Opportunities for the AI.
   */
  public async getContactContext(
    contactId: string,
    accessToken: string,
    instanceUrl: string
  ): Promise<SalesforceContext> {
    try {
      const conn = new jsforce.Connection({ accessToken, instanceUrl });
      const context: SalesforceContext = { opportunities: [] };

      // Query 1: Get Account Details via the Contact
      const contactQuery = await conn.query<{ Account: { Name: string; Industry: string; Website: string } }>(
        `SELECT Account.Name, Account.Industry, Account.Website FROM Contact WHERE Id = '${contactId}' LIMIT 1`
      );

      if (contactQuery.records.length > 0 && contactQuery.records[0].Account) {
        context.account = contactQuery.records[0].Account;
        logger.info('Found Salesforce Account context', { company: context.account.Name });
      }

      // Query 2: Get Open Deals (Opportunities)
      const oppQuery = await conn.query<{ Opportunity: { Name: string; StageName: string; Amount: number; CloseDate: string } }>(
        `SELECT Opportunity.Name, Opportunity.StageName, Opportunity.Amount, Opportunity.CloseDate 
         FROM OpportunityContactRole 
         WHERE ContactId = '${contactId}' 
         AND Opportunity.IsClosed = false 
         ORDER BY Opportunity.CloseDate ASC LIMIT 5`
      );

      if (oppQuery.records.length > 0) {
        // @ts-ignore - jsforce types are loose here
        context.opportunities = oppQuery.records.map(r => r.Opportunity);
        logger.info('Found Salesforce Opportunities', { count: context.opportunities.length });
      }

      return context;

    } catch (error) {
      logger.warn('Failed to fetch deep context', { error });
      return { opportunities: [] };
    }
  }

  /**
   * Helper: Bulk Search
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
        if (contact) results.push(contact);
      } catch (e) { /* ignore individual failures */ }
    }
    return results;
  }

  /**
   * Helper: Create Task
   */
  public async createTask(
    subject: string,
    description: string,
    accessToken: string,
    instanceUrl: string
  ): Promise<string> {
    const conn = new jsforce.Connection({ accessToken, instanceUrl });
    const result = await conn.sobject('Task').create({
      Subject: subject,
      Description: description,
      Status: 'Completed',
      ActivityDate: new Date().toISOString().split('T')[0],
    });
    if (!result.success) throw new Error('Task creation failed');
    return result.id;
  }

  /**
   * Helper: Associate Task
   */
  public async associateTaskToContact(
    taskId: string,
    contactId: string,
    accessToken: string,
    instanceUrl: string
  ): Promise<void> {
    const conn = new jsforce.Connection({ accessToken, instanceUrl });
    await conn.sobject('Task').update({ Id: taskId, WhoId: contactId });
  }

  public getConnection(accessToken: string, instanceUrl: string): jsforce.Connection {
    return new jsforce.Connection({ accessToken, instanceUrl });
  }

  /**
   * Get emails/tasks for a contact (Salesforce stores emails as Tasks or EmailMessage)
   */
  public async getEmailsForContact(
    contactId: string,
    accessToken: string,
    instanceUrl: string,
    limit: number = 20
  ): Promise<CRMEmailActivity[]> {
    try {
      const conn = new jsforce.Connection({ accessToken, instanceUrl });
      const emails: CRMEmailActivity[] = [];

      // Query Tasks that are email-related (TaskSubtype = 'Email')
      const taskQuery = await conn.query<{
        Id: string;
        Subject: string;
        Description: string;
        ActivityDate: string;
        Status: string;
      }>(
        `SELECT Id, Subject, Description, ActivityDate, Status
         FROM Task
         WHERE WhoId = '${contactId}'
         AND (TaskSubtype = 'Email' OR Subject LIKE 'Email:%')
         ORDER BY ActivityDate DESC
         LIMIT ${limit}`
      );

      for (const task of taskQuery.records) {
        emails.push({
          id: task.Id as string,
          subject: (task.Subject as string) || 'No Subject',
          snippet: task.Description ? (task.Description as string).substring(0, 200) : undefined,
          date: task.ActivityDate as string,
          direction: 'outbound', // Tasks are typically outbound
          source: 'salesforce',
        });
      }

      // Also try to query EmailMessage if available (requires Email-to-Case or similar)
      try {
        const emailQuery = await conn.query<{
          Id: string;
          Subject: string;
          TextBody: string;
          CreatedDate: string;
          Incoming: boolean;
        }>(
          `SELECT Id, Subject, TextBody, CreatedDate, Incoming
           FROM EmailMessage
           WHERE RelatedToId = '${contactId}'
           ORDER BY CreatedDate DESC
           LIMIT ${limit}`
        );

        for (const email of emailQuery.records) {
          emails.push({
            id: email.Id as string,
            subject: (email.Subject as string) || 'No Subject',
            snippet: email.TextBody ? (email.TextBody as string).substring(0, 200) : undefined,
            date: email.CreatedDate as string,
            direction: email.Incoming ? 'inbound' : 'outbound',
            source: 'salesforce',
          });
        }
      } catch {
        // EmailMessage may not be available in all orgs
        logger.debug('EmailMessage object not available in this Salesforce org');
      }

      // Sort by date descending
      emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      logger.info('Fetched Salesforce emails for contact', { contactId, count: emails.length });
      return emails.slice(0, limit);
    } catch (error) {
      logger.error('Failed to fetch Salesforce emails', { contactId, error });
      return [];
    }
  }

  /**
   * Get notes for a contact
   */
  public async getNotesForContact(
    contactId: string,
    accessToken: string,
    instanceUrl: string,
    limit: number = 10
  ): Promise<CRMNote[]> {
    try {
      const conn = new jsforce.Connection({ accessToken, instanceUrl });
      const notes: CRMNote[] = [];

      // Query ContentNote via ContentDocumentLink
      try {
        const noteQuery = await conn.query<{
          ContentDocument: { LatestPublishedVersion: { Title: string; TextPreview: string } };
          ContentDocumentId: string;
          LinkedEntity: { Id: string };
          SystemModstamp: string;
        }>(
          `SELECT ContentDocument.LatestPublishedVersion.Title,
                  ContentDocument.LatestPublishedVersion.TextPreview,
                  ContentDocumentId, SystemModstamp
           FROM ContentDocumentLink
           WHERE LinkedEntityId = '${contactId}'
           AND ContentDocument.FileType = 'SNOTE'
           ORDER BY SystemModstamp DESC
           LIMIT ${limit}`
        );

        for (const note of noteQuery.records) {
          const version = note.ContentDocument?.LatestPublishedVersion;
          if (version) {
            notes.push({
              id: note.ContentDocumentId as string,
              content: `${version.Title || ''}: ${version.TextPreview || ''}`.trim(),
              date: note.SystemModstamp as string,
              source: 'salesforce',
            });
          }
        }
      } catch {
        // ContentDocumentLink may have limited access
        logger.debug('ContentDocumentLink query failed, trying Note object');
      }

      // Also try legacy Note object
      try {
        const legacyNoteQuery = await conn.query<{
          Id: string;
          Title: string;
          Body: string;
          CreatedDate: string;
        }>(
          `SELECT Id, Title, Body, CreatedDate
           FROM Note
           WHERE ParentId = '${contactId}'
           ORDER BY CreatedDate DESC
           LIMIT ${limit}`
        );

        for (const note of legacyNoteQuery.records) {
          notes.push({
            id: note.Id as string,
            content: `${note.Title || ''}: ${note.Body || ''}`.trim(),
            date: note.CreatedDate as string,
            source: 'salesforce',
          });
        }
      } catch {
        logger.debug('Legacy Note object query failed');
      }

      // Sort by date descending and deduplicate
      notes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      logger.info('Fetched Salesforce notes for contact', { contactId, count: notes.length });
      return notes.slice(0, limit);
    } catch (error) {
      logger.error('Failed to fetch Salesforce notes', { contactId, error });
      return [];
    }
  }

  /**
   * Get recent activities (Tasks, Events) for a contact
   */
  public async getActivitiesForContact(
    contactId: string,
    accessToken: string,
    instanceUrl: string,
    limit: number = 20
  ): Promise<Array<{ id: string; type: string; subject: string; date: string; description?: string }>> {
    try {
      const conn = new jsforce.Connection({ accessToken, instanceUrl });
      const activities: Array<{ id: string; type: string; subject: string; date: string; description?: string }> = [];

      // Query Tasks
      const taskQuery = await conn.query<{
        Id: string;
        Subject: string;
        Description: string;
        ActivityDate: string;
        Type: string;
      }>(
        `SELECT Id, Subject, Description, ActivityDate, Type
         FROM Task
         WHERE WhoId = '${contactId}'
         ORDER BY ActivityDate DESC
         LIMIT ${limit}`
      );

      for (const task of taskQuery.records) {
        activities.push({
          id: task.Id as string,
          type: (task.Type as string) || 'Task',
          subject: (task.Subject as string) || 'No Subject',
          date: task.ActivityDate as string,
          description: task.Description ? (task.Description as string).substring(0, 200) : undefined,
        });
      }

      // Query Events
      const eventQuery = await conn.query<{
        Id: string;
        Subject: string;
        Description: string;
        StartDateTime: string;
        Type: string;
      }>(
        `SELECT Id, Subject, Description, StartDateTime, Type
         FROM Event
         WHERE WhoId = '${contactId}'
         ORDER BY StartDateTime DESC
         LIMIT ${limit}`
      );

      for (const event of eventQuery.records) {
        activities.push({
          id: event.Id as string,
          type: (event.Type as string) || 'Event',
          subject: (event.Subject as string) || 'No Subject',
          date: event.StartDateTime as string,
          description: event.Description ? (event.Description as string).substring(0, 200) : undefined,
        });
      }

      // Sort by date descending
      activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      logger.info('Fetched Salesforce activities', { contactId, count: activities.length });
      return activities.slice(0, limit);
    } catch (error) {
      logger.error('Failed to fetch Salesforce activities', { contactId, error });
      return [];
    }
  }

  /**
   * Get comprehensive contact data including deals, emails, and notes
   * This is the main method for prep data collection
   */
  public async getContactData(
    email: string,
    accessToken: string,
    instanceUrl: string
  ): Promise<CRMContactData | null> {
    try {
      // First, find the contact
      const contact = await this.searchContactByEmail(email, accessToken, instanceUrl);
      if (!contact) {
        logger.debug('Contact not found in Salesforce', { email });
        return null;
      }

      // Fetch context (deals), emails, and notes in parallel
      const [sfContext, emails, notes] = await Promise.all([
        this.getContactContext(contact.id, accessToken, instanceUrl),
        this.getEmailsForContact(contact.id, accessToken, instanceUrl),
        this.getNotesForContact(contact.id, accessToken, instanceUrl),
      ]);

      // Transform opportunities to CRMSnapshot format
      const deals: CRMSnapshot[] = sfContext.opportunities.map(opp => ({
        dealId: undefined, // Salesforce doesn't return ID in current query
        dealName: opp.Name,
        dealValue: opp.Amount,
        dealStage: opp.StageName,
        closeDate: opp.CloseDate,
        source: 'salesforce' as const,
      }));

      // Get contact role if available (would need additional query)
      let jobTitle: string | undefined;
      let role: string | undefined;

      try {
        const conn = new jsforce.Connection({ accessToken, instanceUrl });
        const contactDetails = await conn.sobject('Contact')
          .find({ Id: contact.id }, { Title: 1 })
          .limit(1)
          .execute();

        if (contactDetails.length > 0) {
          jobTitle = contactDetails[0].Title as string | undefined;
        }

        // Check OpportunityContactRole for deal role
        const roleQuery = await conn.query<{ Role: string }>(
          `SELECT Role FROM OpportunityContactRole WHERE ContactId = '${contact.id}' LIMIT 1`
        );
        if (roleQuery.records.length > 0) {
          role = roleQuery.records[0].Role as string;
        }
      } catch {
        // Optional data, ignore errors
      }

      // Find last activity date
      const allDates = [
        ...emails.map(e => new Date(e.date).getTime()),
        ...notes.map(n => new Date(n.date).getTime()),
      ].filter(d => !isNaN(d));

      const lastActivityDate = allDates.length > 0
        ? new Date(Math.max(...allDates)).toISOString()
        : undefined;

      const contactData: CRMContactData = {
        contactId: contact.id,
        email: contact.email,
        name: contact.name,
        jobTitle,
        role,
        source: 'salesforce',
        deals,
        emails,
        notes,
        lastActivityDate,
      };

      logger.info('Fetched comprehensive Salesforce contact data', {
        email,
        deals: deals.length,
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
}
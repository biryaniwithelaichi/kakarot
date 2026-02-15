import { SalesforceOAuthToken } from '../providers/SalesforceOAuthProvider';
import { HubSpotOAuthToken } from '../providers/HubSpotOAuthProvider';
import { createLogger } from '../core/logger';
import { getContainer } from '../core/container';
import type { ContactMatch } from './CRMEmailMatcher';
import type { Meeting } from '@shared/types';

const logger = createLogger('CRMNoteSyncService');

export class CRMNoteSyncService {
  /**
   * Push meeting notes to Salesforce contact records
   */
  async pushToSalesforce(meeting: Meeting, matches: ContactMatch[], token: SalesforceOAuthToken): Promise<void> {
    try {
      const { salesforceService } = getContainer();
      const salesforceMatches = matches.filter((m) => m.provider === 'salesforce');

      for (const match of salesforceMatches) {
        try {
          const noteContent = this.formatNoteContent(meeting);

          // Create a task associated with the contact
          const taskId = await salesforceService.createTask(
            `Meeting: ${meeting.title}`,
            noteContent,
            token.accessToken,
            token.instanceUrl
          );

          // Associate with the contact
          await salesforceService.associateTaskToContact(
            taskId,
            match.crmId,
            token.accessToken,
            token.instanceUrl
          );

          logger.info('Task created and associated in Salesforce', {
            email: match.email,
            contactId: match.crmId,
            taskId,
          });
        } catch (err) {
          logger.warn('Failed to push notes to Salesforce for contact', {
            email: match.email,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to push notes to Salesforce', { error: message });
      throw new Error(`Failed to push notes to Salesforce: ${message}`);
    }
  }

  /**
   * Push meeting notes to HubSpot contact records using official API
   */
  async pushToHubSpot(meeting: Meeting, matches: ContactMatch[], token: HubSpotOAuthToken): Promise<void> {
    try {
      const { hubSpotService } = getContainer();
      const hubspotMatches = matches.filter((m) => m.provider === 'hubspot');

      for (const match of hubspotMatches) {
        try {
          const noteContent = this.formatNoteContent(meeting);

          // Create a note with the transcript
          const noteId = await hubSpotService.createNote(noteContent, token.accessToken);

          logger.info('Note created in HubSpot', {
            email: match.email,
            noteId,
          });

          // Associate the note to the contact
          try {
            await hubSpotService.associateNoteToContact(noteId, match.crmId, token.accessToken);

            logger.info('Note associated to HubSpot contact', {
              email: match.email,
              contactId: match.crmId,
              noteId,
            });
          } catch (assocErr) {
            logger.warn('Failed to associate note to HubSpot contact, but note was created', {
              email: match.email,
              noteId,
              error: assocErr instanceof Error ? assocErr.message : 'Unknown',
            });
            // Don't fail the entire operation if association fails, note is still created
          }
        } catch (err) {
          logger.warn('Failed to create note in HubSpot for contact', {
            email: match.email,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to push notes to HubSpot', { error: message });
      throw new Error(`Failed to push notes to HubSpot: ${message}`);
    }
  }

  /**
   * Format meeting notes for CRM (HubSpot's hsnotebody format)
   */
  private formatNoteContent(meeting: Meeting): string {
    const sections: string[] = [];

    // Title and metadata
    sections.push(`Meeting: ${meeting.title}`);
    sections.push(`Date: ${new Date(meeting.createdAt).toLocaleString()}`);
    sections.push(`Duration: ${Math.floor(meeting.duration / 60)} minutes`);
    sections.push('');

    // Participants
    if (meeting.attendeeEmails && meeting.attendeeEmails.length > 0) {
      sections.push('Participants:');
      sections.push(meeting.attendeeEmails.join(', '));
      sections.push('');
    }

    // Overview/Summary
    if (meeting.overview) {
      sections.push('Summary:');
      sections.push(meeting.overview);
      sections.push('');
    }

    // Notes/Details
    const notes = meeting.notesMarkdown || meeting.notesPlain || meeting.summary;
    if (notes) {
      sections.push('Details:');
      sections.push(notes);
    }

    return sections.join('\n');
  }

  /**
   * Push notes to CRM
   */
  async pushNotes(
    meeting: Meeting,
    matches: ContactMatch[],
    provider: 'salesforce' | 'hubspot',
    token: SalesforceOAuthToken | HubSpotOAuthToken
  ): Promise<void> {
    if (provider === 'salesforce') {
      return this.pushToSalesforce(meeting, matches, token as SalesforceOAuthToken);
    } else {
      return this.pushToHubSpot(meeting, matches, token as HubSpotOAuthToken);
    }
  }
}

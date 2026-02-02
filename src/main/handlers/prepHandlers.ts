import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';
import type { GenerateMeetingPrepInput, MeetingPrepOutput } from '../services/PrepService';
import type {
  TaskCommitment,
  CompanyInfo,
  EnhancedMeetingPrepResult,
  CRMSnapshot,
  HubSpotOAuthToken,
  SalesforceOAuthToken,
} from '@shared/types';

const logger = createLogger('PrepHandlers');

// In-memory store for task completion status (would be better in DB for persistence)
const taskCompletionStatus: Map<string, { completed: boolean; completedAt?: Date }> = new Map();

// In-memory store for action item completion status (new enhanced prep)
const actionItemStatus: Map<string, { completed: boolean; completedAt?: string }> = new Map();

export function registerPrepHandlers(): void {
  // Generate meeting briefing
  ipcMain.handle(
    IPC_CHANNELS.PREP_GENERATE_BRIEFING,
    async (_event, input: GenerateMeetingPrepInput): Promise<MeetingPrepOutput> => {
      try {
        const { prepService, aiProvider } = getContainer();

        if (!prepService) {
          throw new Error('Prep service not available');
        }

        if (!aiProvider) {
          throw new Error('AI provider not configured');
        }

        logger.info('Generating meeting prep briefing', {
          meetingType: input.meeting.meeting_type,
          participantCount: input.participants.length,
        });

        const result = await prepService.generateMeetingPrep(input);

        logger.debug('Meeting prep generated successfully', {
          participantCount: result.participants.length,
          topicCount: result.agenda.key_topics.length,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to generate meeting prep', { error: errorMessage });
        throw error;
      }
    }
  );

  // Get task commitments for a participant
  ipcMain.handle(
    IPC_CHANNELS.PREP_GET_TASK_COMMITMENTS,
    async (_event, participantEmail: string): Promise<TaskCommitment[]> => {
      try {
        const { prepService } = getContainer();
        if (!prepService) {
          throw new Error('Prep service not available');
        }

        const commitments = await prepService.getTaskCommitmentsForParticipant(participantEmail);

        // Apply cached completion status
        return commitments.map(c => {
          const status = taskCompletionStatus.get(c.id);
          if (status) {
            return { ...c, completed: status.completed, completedAt: status.completedAt };
          }
          return c;
        });
      } catch (error) {
        logger.error('Failed to get task commitments', { error, participantEmail });
        return [];
      }
    }
  );

  // Toggle task commitment completion status
  ipcMain.handle(
    IPC_CHANNELS.PREP_TOGGLE_TASK_COMMITMENT,
    async (_event, taskId: string, completed: boolean): Promise<void> => {
      try {
        taskCompletionStatus.set(taskId, {
          completed,
          completedAt: completed ? new Date() : undefined,
        });
        logger.debug('Task commitment toggled', { taskId, completed });
      } catch (error) {
        logger.error('Failed to toggle task commitment', { error, taskId });
        throw error;
      }
    }
  );

  // Fetch company info from email domain
  ipcMain.handle(
    IPC_CHANNELS.PREP_FETCH_COMPANY_INFO,
    async (_event, email: string): Promise<CompanyInfo | null> => {
      try {
        const { companyInfoService } = getContainer();
        if (!companyInfoService) {
          logger.warn('Company info service not available');
          return null;
        }

        return await companyInfoService.fetchCompanyInfo(email);
      } catch (error) {
        logger.error('Failed to fetch company info', { error, email });
        return null;
      }
    }
  );

  // ============================================================
  // NEW ENHANCED PREP HANDLERS
  // ============================================================

  // Generate enhanced meeting briefing (new format)
  ipcMain.handle(
    IPC_CHANNELS.PREP_GENERATE_ENHANCED_BRIEFING,
    async (_event, input: GenerateMeetingPrepInput): Promise<EnhancedMeetingPrepResult> => {
      try {
        const { prepService, aiProvider } = getContainer();

        if (!prepService) {
          throw new Error('Prep service not available');
        }

        if (!aiProvider) {
          throw new Error('AI provider not configured');
        }

        logger.info('Generating enhanced meeting prep briefing', {
          meetingType: input.meeting.meeting_type,
          participantCount: input.participants.length,
        });

        const result = await prepService.generateEnhancedMeetingPrep(input);

        logger.debug('Enhanced meeting prep generated successfully', {
          participantCount: result.participants.length,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to generate enhanced meeting prep', { error: errorMessage });
        throw error;
      }
    }
  );

  // Toggle action item completion status (for new enhanced prep)
  ipcMain.handle(
    IPC_CHANNELS.PREP_TOGGLE_ACTION_ITEM,
    async (_event, actionItemId: string, completed: boolean): Promise<void> => {
      try {
        actionItemStatus.set(actionItemId, {
          completed,
          completedAt: completed ? new Date().toISOString() : undefined,
        });
        logger.debug('Action item toggled', { actionItemId, completed });
      } catch (error) {
        logger.error('Failed to toggle action item', { error, actionItemId });
        throw error;
      }
    }
  );

  // Fetch CRM snapshot (deal data) for a contact
  ipcMain.handle(
    IPC_CHANNELS.PREP_FETCH_CRM_SNAPSHOT,
    async (_event, email: string): Promise<CRMSnapshot | null> => {
      try {
        const { hubSpotService, salesforceService, settingsRepo } = getContainer();
        const settings = settingsRepo?.getSettings();

        // Try HubSpot first
        const hubspotToken = settings?.crmConnections?.hubspot as HubSpotOAuthToken | undefined;
        if (hubspotToken?.accessToken && hubSpotService) {
          let token = hubspotToken;
          if (hubSpotService.isTokenExpired(token) && token.refreshToken) {
            token = await hubSpotService.refreshAccessToken(token.refreshToken);
          }

          const contact = await hubSpotService.searchContactByEmail(email, token.accessToken);
          if (contact) {
            const deals = await hubSpotService.getDealsForContact(contact.id, token.accessToken);
            if (deals.length > 0) {
              const deal = deals[0];
              return {
                dealId: deal.id,
                dealName: deal.name,
                dealValue: deal.amount,
                dealStage: deal.stage,
                closeDate: deal.closeDate,
                source: 'hubspot',
              };
            }
          }
        }

        // Try Salesforce
        const salesforceToken = settings?.crmConnections?.salesforce as SalesforceOAuthToken | undefined;
        if (salesforceToken?.accessToken && salesforceService) {
          const contact = await salesforceService.searchContactByEmail(
            email,
            salesforceToken.accessToken,
            salesforceToken.instanceUrl
          );
          if (contact) {
            const context = await salesforceService.getContactContext(
              contact.id,
              salesforceToken.accessToken,
              salesforceToken.instanceUrl
            );
            if (context.opportunities.length > 0) {
              const opp = context.opportunities[0];
              return {
                dealName: opp.Name,
                dealValue: opp.Amount,
                dealStage: opp.StageName,
                closeDate: opp.CloseDate,
                source: 'salesforce',
              };
            }
          }
        }

        logger.debug('No CRM snapshot found', { email });
        return null;
      } catch (error) {
        logger.error('Failed to fetch CRM snapshot', { error, email });
        return null;
      }
    }
  );

  logger.info('Prep handlers registered');
}

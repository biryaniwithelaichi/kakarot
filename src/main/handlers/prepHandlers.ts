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
  DynamicPrepResult,
  InferredObjective,
  CustomMeetingType,
  CalendarEvent,
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

  // ============================================================
  // DYNAMIC PREP HANDLERS - Signal-driven, role-agnostic
  // ============================================================

  // Generate dynamic prep with signal scoring and dynamic brief
  ipcMain.handle(
    IPC_CHANNELS.PREP_GENERATE_DYNAMIC,
    async (
      _event,
      input: GenerateMeetingPrepInput & {
        objective?: CustomMeetingType | null;
        calendarEvent?: CalendarEvent | null;
      }
    ): Promise<DynamicPrepResult> => {
      try {
        const { prepService, aiProvider } = getContainer();

        if (!prepService) {
          throw new Error('Prep service not available');
        }

        if (!aiProvider) {
          throw new Error('AI provider not configured');
        }

        logger.info('Generating dynamic prep', {
          meetingType: input.meeting.meeting_type,
          participantCount: input.participants.length,
          hasObjective: !!input.objective,
          hasCalendarEvent: !!input.calendarEvent,
        });

        // Get learned feedback weights
        const feedbackWeights = prepService.getFeedbackWeights();

        const result = await prepService.generateDynamicPrep({
          ...input,
          feedbackWeights,
        });

        logger.debug('Dynamic prep generated successfully', {
          participantCount: result.participants.length,
          inferred: result.meeting.inferred,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to generate dynamic prep', { error: errorMessage });
        throw error;
      }
    }
  );

  // Infer meeting objective from context
  ipcMain.handle(
    IPC_CHANNELS.PREP_INFER_OBJECTIVE,
    async (
      _event,
      input: {
        calendarEvent?: CalendarEvent | null;
        attendeeEmails: string[];
      }
    ): Promise<InferredObjective> => {
      try {
        const { prepService, meetingRepo, hubSpotService, salesforceService, settingsRepo } = getContainer();

        if (!prepService) {
          throw new Error('Prep service not available');
        }

        // Fetch CRM data for attendees
        const settings = settingsRepo?.getSettings();
        const crmDataPromises = input.attendeeEmails.map(async (email) => {
          try {
            const hubspotToken = settings?.crmConnections?.hubspot as HubSpotOAuthToken | undefined;
            if (hubspotToken?.accessToken && hubSpotService) {
              return await hubSpotService.getContactData(email, hubspotToken.accessToken);
            }
            return null;
          } catch {
            return null;
          }
        });
        const crmData = (await Promise.all(crmDataPromises)).filter(Boolean);

        // Get past meetings
        const allMeetings = meetingRepo?.findAll() || [];

        const result = await prepService.inferMeetingObjective(
          input.calendarEvent || null,
          input.attendeeEmails,
          crmData as any[],
          allMeetings
        );

        logger.debug('Objective inferred', {
          suggestedType: result.suggestedType,
          confidence: result.confidence,
        });

        return result;
      } catch (error) {
        logger.error('Failed to infer objective', { error });
        return {
          suggestedType: 'general',
          confidence: 30,
          reasoning: 'Failed to infer - using default',
          userCanOverride: true,
        };
      }
    }
  );

  // Record insight feedback for learning
  ipcMain.handle(
    IPC_CHANNELS.PREP_RECORD_FEEDBACK,
    async (
      _event,
      input: {
        insightId: string;
        insightCategory: string;
        feedback: 'useful' | 'not_useful' | 'dismissed';
        participantEmail?: string;
      }
    ): Promise<void> => {
      try {
        const { prepService } = getContainer();

        if (!prepService) {
          throw new Error('Prep service not available');
        }

        await prepService.recordInsightFeedback(
          input.insightId,
          input.insightCategory,
          input.feedback,
          input.participantEmail
        );

        logger.debug('Feedback recorded', {
          insightId: input.insightId,
          category: input.insightCategory,
          feedback: input.feedback,
        });
      } catch (error) {
        logger.error('Failed to record feedback', { error });
        throw error;
      }
    }
  );

  // Get learned feedback weights
  ipcMain.handle(
    IPC_CHANNELS.PREP_GET_FEEDBACK_WEIGHTS,
    async (_event): Promise<Record<string, number>> => {
      try {
        const { prepService } = getContainer();

        if (!prepService) {
          return {};
        }

        return prepService.getFeedbackWeights();
      } catch (error) {
        logger.error('Failed to get feedback weights', { error });
        return {};
      }
    }
  );

  // Reset feedback weights to defaults
  ipcMain.handle(
    IPC_CHANNELS.PREP_RESET_FEEDBACK_WEIGHTS,
    async (_event): Promise<void> => {
      try {
        const { prepService } = getContainer();

        if (!prepService) {
          throw new Error('Prep service not available');
        }

        prepService.resetFeedbackWeights();
        logger.info('Feedback weights reset');
      } catch (error) {
        logger.error('Failed to reset feedback weights', { error });
        throw error;
      }
    }
  );

  // ============================================================
  // CONVERSATIONAL PREP HANDLERS - Granola-style natural output
  // ============================================================

  // Generate conversational prep (single person, markdown output)
  ipcMain.handle(
    IPC_CHANNELS.PREP_GENERATE_CONVERSATIONAL,
    async (_event, input: { personQuery: string; calendarEventId?: string }) => {
      try {
        const { prepService, aiProvider } = getContainer();

        if (!prepService) {
          throw new Error('Prep service not available');
        }

        if (!aiProvider) {
          throw new Error('AI provider not configured');
        }

        logger.info('Generating conversational prep', {
          personQuery: input.personQuery,
        });

        const result = await prepService.generateConversationalPrep(input);

        logger.debug('Conversational prep generated successfully', {
          meetingsAnalyzed: result.meetingsAnalyzed,
          processingTime: result.processingTimeMs,
          dataQuality: result.participant.dataQuality,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to generate conversational prep', { error: errorMessage });
        throw error;
      }
    }
  );

  // Quick search for person (autocomplete)
  ipcMain.handle(
    IPC_CHANNELS.PREP_QUICK_SEARCH_PERSON,
    async (_event, query: string) => {
      try {
        const { prepService } = getContainer();

        if (!prepService) {
          return [];
        }

        return await prepService.quickSearchPerson(query);
      } catch (error) {
        logger.error('Failed to search people', { error, query });
        return [];
      }
    }
  );

  // ============================================================
  // CONVERSATIONAL PREP CHAT (OMNIBAR)
  // ============================================================

  // Send a chat message for prep (supports follow-up conversations)
  ipcMain.handle(
    IPC_CHANNELS.PREP_CHAT_SEND,
    async (_event, input: import('@shared/types').PrepChatInput, existingConversation?: import('@shared/types').PrepConversation) => {
      try {
        const { prepService, aiProvider } = getContainer();

        if (!prepService) {
          throw new Error('Prep service not available');
        }

        if (!aiProvider) {
          throw new Error('AI provider not configured');
        }

        logger.info('Processing prep chat message', {
          messageLength: input.message.length,
          hasConversation: !!existingConversation,
          conversationId: existingConversation?.id,
        });

        const result = await prepService.generatePrepChatResponse(input, existingConversation);

        logger.debug('Prep chat response generated', {
          conversationId: result.conversationId,
          responseLength: result.message.content.length,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to process prep chat', { error: errorMessage });
        throw error;
      }
    }
  );

  // Streaming chat message for prep (lower perceived latency)
  ipcMain.handle(
    IPC_CHANNELS.PREP_CHAT_STREAM_START,
    async (event, input: import('@shared/types').PrepChatInput, existingConversation?: import('@shared/types').PrepConversation) => {
      try {
        const { prepService, aiProvider } = getContainer();

        if (!prepService) {
          throw new Error('Prep service not available');
        }

        if (!aiProvider) {
          throw new Error('AI provider not configured');
        }

        logger.info('Processing streaming prep chat message', {
          messageLength: input.message.length,
          hasConversation: !!existingConversation,
        });

        // Start streaming in the background - don't await
        prepService.generatePrepChatResponseStreaming(
          input,
          existingConversation,
          // onChunk
          (chunk: string) => {
            event.sender.send(IPC_CHANNELS.PREP_CHAT_STREAM_CHUNK, chunk);
          },
          // onStart
          (metadata: { conversationId: string; meetingReferences: any[] }) => {
            event.sender.send(IPC_CHANNELS.PREP_CHAT_STREAM_START, metadata);
          },
          // onEnd
          (response: import('@shared/types').PrepChatResponse) => {
            event.sender.send(IPC_CHANNELS.PREP_CHAT_STREAM_END, response);
          },
          // onError
          (error: Error) => {
            event.sender.send(IPC_CHANNELS.PREP_CHAT_STREAM_ERROR, error.message);
          }
        );

        // Return immediately - streaming happens via events
        return { streaming: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to start streaming prep chat', { error: errorMessage });
        throw error;
      }
    }
  );

  logger.info('Prep handlers registered');
}

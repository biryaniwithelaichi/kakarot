import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';
import type { GenerateMeetingPrepInput, MeetingPrepOutput } from '../services/PrepService';
import type { TaskCommitment, CompanyInfo } from '@shared/types';

const logger = createLogger('PrepHandlers');

// In-memory store for task completion status (would be better in DB for persistence)
const taskCompletionStatus: Map<string, { completed: boolean; completedAt?: Date }> = new Map();

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

  logger.info('Prep handlers registered');
}

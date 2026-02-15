import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';
import { SalesforceOAuthProvider } from '../providers/SalesforceOAuthProvider';
import { HubSpotOAuthProvider } from '../providers/HubSpotOAuthProvider';
import { CRMEmailMatcher } from '../services/CRMEmailMatcher';
import { CRMNoteSyncService } from '../services/CRMNoteSyncService';

const logger = createLogger('CRMHandlers');

let mainWindowRef: BrowserWindow | null = null;

export function setCRMHandlersMainWindow(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;
}

export function registerCRMHandlers(): void {
  // Connect CRM
  ipcMain.handle(IPC_CHANNELS.CRM_CONNECT, async (_event, provider: 'salesforce' | 'hubspot') => {
    try {
      if (!mainWindowRef) {
        throw new Error('Main window not available');
      }

      logger.info('CRM connect requested', { provider });

      const { settingsRepo } = getContainer();
      const settings = settingsRepo.getSettings();

      let result;

      if (provider === 'salesforce') {
        // Use OAuth client ID from environment or settings (secret is on backend)
        const clientId = process.env.SALESFORCE_CLIENT_ID || settings.crmOAuthSalesforceClientId || '';

        if (!clientId) {
          throw new Error('Salesforce OAuth client ID not configured');
        }

        const oauthProvider = new SalesforceOAuthProvider(clientId);
        result = await oauthProvider.authenticate(mainWindowRef);
      } else {
        // HubSpot OAuth - client ID only (secret is on backend)
        const clientId = process.env.HUBSPOT_CLIENT_ID || settings.crmOAuthHubSpotClientId || '';

        if (!clientId) {
          throw new Error('HubSpot OAuth client ID not configured');
        }

        const oauthProvider = new HubSpotOAuthProvider(clientId);
        result = await oauthProvider.authenticate(mainWindowRef);
      }

      // Store in settings via SettingsRepository
      const nextConnections = {
        ...(settings.crmConnections || {}),
        [provider]: result,
      };
      settings.crmConnections = nextConnections;
      settingsRepo.updateSettings(settings);

      logger.info('CRM connected successfully', { provider });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to connect CRM', { provider, error: message });
      throw new Error(`Failed to connect ${provider}: ${message}`);
    }
  });

  // Disconnect CRM
  ipcMain.handle(IPC_CHANNELS.CRM_DISCONNECT, async (_event, provider: 'salesforce' | 'hubspot') => {
    try {
      logger.info('CRM disconnect requested', { provider });

      const { settingsRepo } = getContainer();
      const settings = settingsRepo.getSettings();
      const nextConnections = { ...(settings.crmConnections || {}) };
      delete nextConnections[provider as keyof typeof nextConnections];
      settings.crmConnections = nextConnections;
      settingsRepo.updateSettings(settings);

      logger.info('CRM disconnected successfully', { provider });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to disconnect CRM', { provider, error: message });
      throw new Error(`Failed to disconnect ${provider}: ${message}`);
    }
  });

  // Push notes to CRM
  ipcMain.handle(IPC_CHANNELS.CRM_PUSH_NOTES, async (_event, meetingId: string) => {
    try {
      logger.info('Push notes to CRM requested', { meetingId });

      const { settingsRepo, meetingRepo } = getContainer();
      const settings = settingsRepo.getSettings();
      const meeting = meetingRepo.findById(meetingId);

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      const emailMatcher = new CRMEmailMatcher();
      const noteSyncService = new CRMNoteSyncService();

      // Determine which CRM to push to
      let activeCRM: 'salesforce' | 'hubspot' | null = null;
      if (settings.crmConnections?.salesforce) {
        activeCRM = 'salesforce';
      } else if (settings.crmConnections?.hubspot) {
        activeCRM = 'hubspot';
      }

      if (!activeCRM || !settings.crmConnections) {
        throw new Error('No CRM connected');
      }

      const crmToken = settings.crmConnections[activeCRM as keyof typeof settings.crmConnections];
      if (!crmToken) {
        throw new Error(`${activeCRM} token not found`);
      }

      // Find matching contacts (prefer attendeeEmails; participants is deprecated)
      const candidateEmails = (meeting.attendeeEmails && meeting.attendeeEmails.length > 0)
        ? meeting.attendeeEmails
        : meeting.participants;
      const emails = (candidateEmails || [])
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes('@'));

      const matches = await emailMatcher.matchEmailsToCRM(
        emails,
        activeCRM as 'salesforce' | 'hubspot',
        crmToken
      );

      if (matches.length === 0) {
        logger.warn('No matching contacts found in CRM', { meetingId });
        return { matched: 0 };
      }

      // Push notes
      await noteSyncService.pushNotes(meeting, matches, activeCRM as 'salesforce' | 'hubspot', crmToken);

      logger.info('Notes pushed to CRM successfully', { meetingId, matchCount: matches.length });
      return { matched: matches.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to push notes to CRM', { meetingId, error: message });
      throw new Error(`Failed to push notes to CRM: ${message}`);
    }
  });
}

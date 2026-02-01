import { config } from 'dotenv';
import { resolve } from 'path';
import { app, BrowserWindow, systemPreferences, globalShortcut } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { createCalloutWindow } from './windows/calloutWindow';
import { initializeDatabase, closeDatabase } from './data/database';
import { initializeContainer, getContainer } from './core/container';
import { registerAllHandlers } from './handlers';
import { createLogger } from './core/logger';
import { initializeErrorHandler } from './core/errorHandler';
import { startPerformanceLogging, stopPerformanceLogging } from './utils/performance';
import { showCalloutWindow } from './windows/calloutWindow';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import type { Callout } from '@shared/types';

// Load .env from project root (for OAuth credentials only - API keys are now server-side)
config({ path: resolve(__dirname, '../../.env') });

// Initialize global error handlers early
initializeErrorHandler();

const logger = createLogger('Main');

const PROTOCOL_SCHEME = 'treeto';

app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);

app.on('open-url', (event, url) => {
  event.preventDefault();
  app.emit('treeto-oauth-url', url);
});

let mainWindow: BrowserWindow | null = null;
let calloutWindow: BrowserWindow | null = null;

// Auto-sync interval: 5 days in milliseconds
const CALENDAR_CONTACTS_SYNC_INTERVAL = 5 * 24 * 60 * 60 * 1000;

/**
 * Check if calendar contacts should be auto-synced and run if needed.
 * Runs on app startup if last sync was more than 5 days ago.
 */
async function checkAndRunCalendarContactsSync(): Promise<void> {
  try {
    const container = getContainer();
    const settings = container.settingsRepo.getSettings();

    // Check if any calendar is connected
    const hasCalendar = settings.calendarConnections?.google || settings.calendarConnections?.outlook;
    if (!hasCalendar) {
      logger.debug('No calendar connected, skipping auto-sync');
      return;
    }

    // Check if sync is needed (never synced or older than 5 days)
    const lastSync = settings.lastCalendarContactsSync || 0;
    const timeSinceLastSync = Date.now() - lastSync;

    if (timeSinceLastSync < CALENDAR_CONTACTS_SYNC_INTERVAL) {
      const daysUntilNextSync = Math.ceil((CALENDAR_CONTACTS_SYNC_INTERVAL - timeSinceLastSync) / (24 * 60 * 60 * 1000));
      logger.debug('Calendar contacts sync not needed yet', { daysUntilNextSync });
      return;
    }

    logger.info('Running auto-sync of calendar contacts', {
      lastSync: lastSync ? new Date(lastSync).toISOString() : 'never',
      daysSinceLastSync: Math.floor(timeSinceLastSync / (24 * 60 * 60 * 1000)),
    });

    // Fetch events from 6 months ago to 6 months in the future
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
    const sixMonthsFromNow = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);

    const events = await container.calendarService.fetchEventsInRange(sixMonthsAgo, sixMonthsFromNow);
    logger.info('Fetched calendar events for auto-sync', { count: events.length });

    // Extract unique attendees
    const attendeeMap = new Map<string, { email: string; name?: string }>();
    for (const event of events) {
      if (event.attendees) {
        for (const attendee of event.attendees) {
          if (attendee.email && !attendeeMap.has(attendee.email.toLowerCase())) {
            attendeeMap.set(attendee.email.toLowerCase(), {
              email: attendee.email.toLowerCase(),
              name: attendee.name,
            });
          }
        }
      }
    }

    const uniqueAttendees = Array.from(attendeeMap.values());
    logger.info('Found unique attendees for auto-sync', { count: uniqueAttendees.length });

    // Create People API fetcher for name resolution
    const peopleApiFetcher = (email: string) => container.calendarService.fetchPersonNameFromGoogle(email);

    // Upsert each attendee
    let synced = 0;
    for (const attendee of uniqueAttendees) {
      await container.peopleRepo.upsertFromCalendarAttendee(
        attendee.email,
        attendee.name,
        undefined,
        peopleApiFetcher
      );
      synced++;
    }

    // Store the last sync timestamp
    container.settingsRepo.updateSettings({ lastCalendarContactsSync: Date.now() });

    logger.info('Calendar contacts auto-sync complete', { synced, total: uniqueAttendees.length });
  } catch (error) {
    logger.error('Failed to auto-sync calendar contacts', { error: (error as Error).message });
  }
}

// Make mainWindow globally accessible for notifications
declare global {
  var mainWindow: BrowserWindow | null;
}
global.mainWindow = null;

async function createWindows() {
  // Request microphone permission on macOS
  if (process.platform === 'darwin') {
    const currentStatus = systemPreferences.getMediaAccessStatus('microphone');
    logger.info('Microphone permission status', { status: currentStatus });

    if (currentStatus !== 'granted') {
      const micAccess = await systemPreferences.askForMediaAccess('microphone');
      logger.info('Microphone access request result', { granted: micAccess });
      if (!micAccess) {
        logger.warn('Microphone access denied - recording will not work');
      }
    }
  }

  await initializeDatabase();
  await initializeContainer();

  mainWindow = createMainWindow();
  calloutWindow = createCalloutWindow();
  
  // Store mainWindow globally for notification service
  global.mainWindow = mainWindow;

  registerAllHandlers(mainWindow, calloutWindow);

  // Start meeting notification service only if calendar is connected
  // Otherwise, delay it until calendar is connected
  const container = getContainer();
  const settings = container.settingsRepo.getSettings();
  const hasCalendar = settings.calendarConnections?.google || settings.calendarConnections?.outlook;
  
  if (hasCalendar) {
    container.meetingNotificationService.start();
  } else {
    // Listen for calendar connection and start service when ready
    mainWindow.webContents.on('ipc-message', (event, channel) => {
      if (channel === IPC_CHANNELS.SETTINGS_UPDATE) {
        const updatedSettings = container.settingsRepo.getSettings();
        const hasCalendarNow = updatedSettings.calendarConnections?.google || updatedSettings.calendarConnections?.outlook;
        
        if (hasCalendarNow && !container.meetingNotificationService['checkInterval']) {
          container.meetingNotificationService.start();
        }
      }
    });
  }

  // Check and run auto-sync of contacts from calendar (every 5 days)
  checkAndRunCalendarContactsSync();

  // Dev-only: Start performance logging and register keyboard shortcuts
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    startPerformanceLogging(60000); // Log every 60 seconds
    const resetShortcut = process.platform === 'darwin' ? 'Cmd+Shift+O' : 'Ctrl+Shift+O';
    globalShortcut.register(resetShortcut, () => {
      logger.info('Dev: Resetting onboarding via keyboard shortcut');
      mainWindow?.webContents.send('dev:reset-onboarding');
    });
    logger.info('Dev: Registered onboarding reset shortcut', { shortcut: resetShortcut });

    // Dev-only: Trigger test callout (Cmd/Ctrl+Option+T)
    const calloutShortcut = process.platform === 'darwin' ? 'Cmd+Option+T' : 'Ctrl+Alt+T';
    globalShortcut.register(calloutShortcut, () => {
      logger.info('Dev: Triggering test callout');
      const testCallout: Callout = {
        id: 'test-' + Date.now(),
        meetingId: 'test-meeting',
        triggeredAt: new Date(),
        question: 'What is the timeline for the next release?',
        context: 'Test context',
        suggestedResponse: 'Based on our sprint planning, we are targeting mid-February for the beta release, with the full release planned for early March.',
        sources: [],
        dismissed: false,
      };
      calloutWindow?.webContents.send(IPC_CHANNELS.CALLOUT_SHOW, testCallout);
      showCalloutWindow();
    });
    logger.info('Dev: Registered test callout shortcut', { shortcut: calloutShortcut });
  }

  logger.info('Application initialized');
}

app.whenReady().then(createWindows);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows();
  }
});

// Handle app quit - cleanup
app.on('before-quit', () => {
  stopPerformanceLogging();
  const container = getContainer();
  container.meetingNotificationService.stop();
  closeDatabase();
  logger.info('Application closing');
});

// Export windows for IPC access
export function getMainWindowInstance(): BrowserWindow | null {
  return mainWindow;
}

export function getCalloutWindow(): BrowserWindow | null {
  return calloutWindow;
}

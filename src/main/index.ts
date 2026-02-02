import { config } from 'dotenv';
import { resolve } from 'path';
import { app, BrowserWindow, systemPreferences, globalShortcut } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { createCalloutWindow } from './windows/calloutWindow';
import { initializeDatabase, closeDatabase } from './data/database';
import { initializeContainer, getContainer } from './core/container';
import { registerAllHandlers } from './handlers';
import { registerSlackHandlers } from './handlers/SlackHandlers'; // ✅ This works if file is in handlers folder
import { createLogger } from './core/logger';
import { initializeErrorHandler } from './core/errorHandler';
import { startPerformanceLogging, stopPerformanceLogging } from './utils/performance';
import { showCalloutWindow } from './windows/calloutWindow';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import type { Callout } from '@shared/types';

// Load .env from project root
config({ path: resolve(__dirname, '../../.env') });

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

const CALENDAR_CONTACTS_SYNC_INTERVAL = 5 * 24 * 60 * 60 * 1000;

async function checkAndRunCalendarContactsSync(): Promise<void> {
  try {
    const container = getContainer();
    const settings = container.settingsRepo.getSettings();

    const hasCalendar = settings.calendarConnections?.google || settings.calendarConnections?.outlook;
    if (!hasCalendar) return;

    const lastSync = settings.lastCalendarContactsSync || 0;
    const timeSinceLastSync = Date.now() - lastSync;

    if (timeSinceLastSync < CALENDAR_CONTACTS_SYNC_INTERVAL) return;

    logger.info('Running auto-sync of calendar contacts');

    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
    const sixMonthsFromNow = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);

    const events = await container.calendarService.fetchEventsInRange(sixMonthsAgo, sixMonthsFromNow);
    
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
    const peopleApiFetcher = (email: string) => container.calendarService.fetchPersonNameFromGoogle(email);

    for (const attendee of uniqueAttendees) {
      await container.peopleRepo.upsertFromCalendarAttendee(
        attendee.email,
        attendee.name,
        undefined,
        peopleApiFetcher
      );
    }

    container.settingsRepo.updateSettings({ lastCalendarContactsSync: Date.now() });
    logger.info('Calendar contacts auto-sync complete');
  } catch (error) {
    logger.error('Failed to auto-sync calendar contacts', { error: (error as Error).message });
  }
}

declare global {
  var mainWindow: BrowserWindow | null;
}
global.mainWindow = null;

async function createWindows() {
  if (process.platform === 'darwin') {
    const currentStatus = systemPreferences.getMediaAccessStatus('microphone');
    if (currentStatus !== 'granted') {
      await systemPreferences.askForMediaAccess('microphone');
    }
  }

  await initializeDatabase();
  await initializeContainer();

  mainWindow = createMainWindow();
  calloutWindow = createCalloutWindow();
  global.mainWindow = mainWindow;

  // Register existing handlers
  registerAllHandlers(mainWindow, calloutWindow);
  
  // Register NEW Slack Handlers
  registerSlackHandlers(); 

  const container = getContainer();
  const settings = container.settingsRepo.getSettings();
  const hasCalendar = settings.calendarConnections?.google || settings.calendarConnections?.outlook;
  
  if (hasCalendar) {
    container.meetingNotificationService.start();
  } else {
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

  checkAndRunCalendarContactsSync();

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    startPerformanceLogging(60000);
    const resetShortcut = process.platform === 'darwin' ? 'Cmd+Shift+O' : 'Ctrl+Shift+O';
    globalShortcut.register(resetShortcut, () => {
      mainWindow?.webContents.send('dev:reset-onboarding');
    });

    const calloutShortcut = process.platform === 'darwin' ? 'Cmd+Option+T' : 'Ctrl+Alt+T';
    globalShortcut.register(calloutShortcut, () => {
      const testCallout: Callout = {
        id: 'test-' + Date.now(),
        meetingId: 'test-meeting',
        triggeredAt: new Date(),
        question: 'Timeline?',
        context: 'Test context',
        suggestedResponse: 'Beta in Feb, Full in March.',
        sources: [],
        dismissed: false,
      };
      calloutWindow?.webContents.send(IPC_CHANNELS.CALLOUT_SHOW, testCallout);
      showCalloutWindow();
    });
  }

  logger.info('Application initialized');
}

app.whenReady().then(createWindows);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindows();
});

app.on('before-quit', () => {
  stopPerformanceLogging();
  const container = getContainer();
  container.meetingNotificationService.stop();
  closeDatabase();
  logger.info('Application closing');
});

export function getMainWindowInstance(): BrowserWindow | null {
  return mainWindow;
}

export function getCalloutWindow(): BrowserWindow | null {
  return calloutWindow;
}
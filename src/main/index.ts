import { config } from 'dotenv';
import { resolve } from 'path';
import { app, BrowserWindow, systemPreferences, globalShortcut, ipcMain } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { createCalloutWindow } from './windows/calloutWindow';
import { IndicatorWindow } from './windows/IndicatorWindow';
import { initializeDatabase, closeDatabase } from './data/database';
import { initializeContainer, getContainer } from './core/container';
import { registerAllHandlers } from './handlers';
import { registerSlackHandlers } from './handlers/SlackHandlers'; // ✅ This works if file is in handlers folder
import { createLogger } from './core/logger';
import { initializeErrorHandler } from './core/errorHandler';
import { startPerformanceLogging, stopPerformanceLogging } from './utils/performance';
import { showCalloutWindow } from './windows/calloutWindow';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { FEATURE_FLAGS } from './config/constants';
import type { Callout, RecordingState } from '@shared/types';

// Load .env: in dev from project root, in production from Resources/ next to app.asar
config({ path: resolve(__dirname, '../../.env') });
if (app.isPackaged) {
  config({ path: resolve(process.resourcesPath, '.env'), override: true });
}

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
let indicatorWindow: IndicatorWindow | null = null;
let recordingState: RecordingState = 'idle';
let indicatorDragState:
  | { startMouseX: number; startMouseY: number; startX: number; startY: number }
  | null = null;

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
  indicatorWindow = new IndicatorWindow();
  global.mainWindow = mainWindow;

  const container = getContainer();

  const updateIndicatorVisibility = () => {
    if (!mainWindow || !indicatorWindow) return;
    const settings = container.settingsRepo.getSettings();
    const indicatorEnabled = settings.showLiveMeetingIndicator ?? true;
    const recordingActive = recordingState === 'recording' || recordingState === 'paused';
    const shouldShow = indicatorEnabled && recordingActive && !mainWindow.isFocused();
    if (shouldShow) {
      indicatorWindow.show();
    } else {
      indicatorWindow.hide();
    }
  };

  // Register existing handlers
  registerAllHandlers(mainWindow, calloutWindow, {
    indicatorWindow,
    onRecordingStateChange: (state) => {
      recordingState = state;
      updateIndicatorVisibility();
    },
  });
  
  // Register NEW Slack Handlers
  registerSlackHandlers(); 

  const settings = container.settingsRepo.getSettings();
  const hasCalendar = settings.calendarConnections?.google || settings.calendarConnections?.outlook;
  let meetingNotificationsStarted = !!hasCalendar;
  
  if (hasCalendar) {
    container.meetingNotificationService.start();
  }

  mainWindow.on('focus', updateIndicatorVisibility);
  mainWindow.on('blur', updateIndicatorVisibility);
  mainWindow.on('minimize', updateIndicatorVisibility);
  mainWindow.on('restore', updateIndicatorVisibility);
  mainWindow.on('show', updateIndicatorVisibility);
  mainWindow.on('hide', updateIndicatorVisibility);

  ipcMain.on(IPC_CHANNELS.INDICATOR_CLICKED, () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
    indicatorWindow?.hide();
  });

  ipcMain.on(IPC_CHANNELS.INDICATOR_DRAG_START, (_event, payload: { screenX: number; screenY: number }) => {
    if (!indicatorWindow) return;
    const position = indicatorWindow.getPosition();
    if (!position) return;
    indicatorDragState = {
      startMouseX: payload.screenX,
      startMouseY: payload.screenY,
      startX: position[0],
      startY: position[1],
    };
  });

  ipcMain.on(IPC_CHANNELS.INDICATOR_DRAG_MOVE, (_event, payload: { screenX: number; screenY: number }) => {
    if (!indicatorWindow || !indicatorDragState) return;
    const dx = payload.screenX - indicatorDragState.startMouseX;
    const dy = payload.screenY - indicatorDragState.startMouseY;
    indicatorWindow.setPosition(
      Math.round(indicatorDragState.startX + dx),
      Math.round(indicatorDragState.startY + dy)
    );
  });

  ipcMain.on(IPC_CHANNELS.INDICATOR_DRAG_END, () => {
    indicatorDragState = null;
  });

  mainWindow.webContents.on('ipc-message', (event, channel) => {
    if (channel === IPC_CHANNELS.SETTINGS_UPDATE) {
      const updatedSettings = container.settingsRepo.getSettings();
      const hasCalendarNow = updatedSettings.calendarConnections?.google || updatedSettings.calendarConnections?.outlook;
      if (hasCalendarNow && !meetingNotificationsStarted) {
        container.meetingNotificationService.start();
        meetingNotificationsStarted = true;
      }
      updateIndicatorVisibility();
    }
  });

  checkAndRunCalendarContactsSync();

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    startPerformanceLogging(60000);
    const resetShortcut = process.platform === 'darwin' ? 'Cmd+Shift+O' : 'Ctrl+Shift+O';
    globalShortcut.register(resetShortcut, () => {
      mainWindow?.webContents.send('dev:reset-onboarding');
    });

    if (FEATURE_FLAGS.enableCallouts) {
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

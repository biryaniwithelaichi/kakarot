import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';

const logger = createLogger('CalendarHandlers');

export function registerCalendarHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CALENDAR_LIST_TODAY, async () => {
    const { calendarService } = getContainer();
    logger.debug('Handling CALENDAR_LIST_TODAY');
    return calendarService.listToday();
  });

  ipcMain.handle(
    IPC_CHANNELS.CALENDAR_CONNECT,
    async (_event, provider: 'google' | 'outlook' | 'icloud', payload?: { appleId: string; appPassword: string }) => {
      const { calendarService } = getContainer();
      logger.debug('Handling CALENDAR_CONNECT', { provider });
      return calendarService.connect(provider, payload);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CALENDAR_DISCONNECT,
    async (_event, provider: 'google' | 'outlook' | 'icloud') => {
      const { calendarService } = getContainer();
      logger.debug('Handling CALENDAR_DISCONNECT', { provider });
      return calendarService.disconnect(provider);
    }
  );

  ipcMain.handle(IPC_CHANNELS.CALENDAR_GET_UPCOMING, async () => {
    const { calendarService } = getContainer();
    logger.debug('Handling CALENDAR_GET_UPCOMING');
    return calendarService.getUpcomingMeetings();
  });

  ipcMain.handle(
    IPC_CHANNELS.CALENDAR_LINK_EVENT,
    async (
      _event,
      calendarEventId: string,
      meetingId: string,
      provider: 'google' | 'outlook' | 'icloud'
    ) => {
      const { calendarService } = getContainer();
      logger.debug('Handling CALENDAR_LINK_EVENT', { calendarEventId, meetingId, provider });
      return calendarService.linkEventToNotes(calendarEventId, meetingId, provider);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CALENDAR_GET_EVENT_FOR_MEETING,
    async (_event, meetingId: string) => {
      const { calendarService } = getContainer();
      logger.debug('Handling CALENDAR_GET_EVENT_FOR_MEETING', { meetingId });
      return calendarService.findCalendarEventForMeeting(meetingId);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CALENDAR_LINK_NOTES,
    async (
      _event,
      calendarEventId: string,
      notesId: string,
      provider: 'google' | 'outlook' | 'icloud'
    ) => {
      const { calendarService } = getContainer();
      logger.debug('Handling CALENDAR_LINK_NOTES', { calendarEventId, notesId, provider });
      return calendarService.linkNotesToEvent(calendarEventId, notesId, provider);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CALENDAR_LIST_CALENDARS,
    async (_event, provider: 'google' | 'outlook' | 'icloud') => {
      const { calendarService } = getContainer();
      logger.debug('Handling CALENDAR_LIST_CALENDARS', { provider });
      return calendarService.listCalendars(provider);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CALENDAR_SET_VISIBLE_CALENDARS,
    async (_event, provider: 'google' | 'outlook' | 'icloud', ids: string[]) => {
      const { calendarService, settingsRepo } = getContainer();
      logger.debug('Handling CALENDAR_SET_VISIBLE_CALENDARS', { provider, count: ids.length });
      await calendarService.setVisibleCalendars(provider, ids);

      // Emit settings changed event to trigger automatic refresh in renderer
      const updatedSettings = settingsRepo.getSettings();
      const windows = BrowserWindow.getAllWindows();
      windows.forEach((window) => {
        window.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, updatedSettings);
      });

      logger.debug('Emitted SETTINGS_CHANGED after visible calendars update');
    }
  );
}
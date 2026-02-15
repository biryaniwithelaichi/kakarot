import { BrowserWindow } from 'electron';
import { registerRecordingHandlers } from './recordingHandlers';
import { registerMeetingHandlers } from './meetingHandlers';
import { registerSettingsHandlers } from './settingsHandlers';
import { registerCalloutHandlers } from './calloutHandlers';
import { registerCalendarHandlers } from './calendarHandlers';
import { registerPeopleHandlers } from './peopleHandlers';
import { registerBranchHandlers } from './branchHandlers';
import { registerCRMHandlers, setCRMHandlersMainWindow } from './crmHandlers';
import { registerChatHandlers } from './chatHandlers';
import { registerPrepHandlers } from './prepHandlers';
import { registerDialogHandlers } from './dialogHandlers';
import { createLogger } from '../core/logger';
import type { RecordingState } from '@shared/types';
import type { IndicatorWindow } from '../windows/IndicatorWindow';

const logger = createLogger('Handlers');

export function registerAllHandlers(
  mainWindow: BrowserWindow,
  calloutWindow: BrowserWindow,
  options?: {
    indicatorWindow?: IndicatorWindow | null;
    onRecordingStateChange?: (state: RecordingState) => void;
  }
): void {
  registerRecordingHandlers(mainWindow, calloutWindow, options);
  registerMeetingHandlers();
  registerSettingsHandlers();
  registerCalloutHandlers();
  registerCalendarHandlers();
  registerPeopleHandlers();
  registerBranchHandlers();
  setCRMHandlersMainWindow(mainWindow);
  registerCRMHandlers();
  registerChatHandlers();
  registerPrepHandlers();
  registerDialogHandlers();

  logger.info('All IPC handlers registered');
}

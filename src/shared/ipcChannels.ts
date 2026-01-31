// IPC channel constants for type-safe communication

export const IPC_CHANNELS = {
  // Recording controls
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_PAUSE: 'recording:pause',
  RECORDING_RESUME: 'recording:resume',
  RECORDING_STATE: 'recording:state',

  // Audio
  AUDIO_CHECK_NATIVE: 'audio:check-native',
  AUDIO_START_NATIVE: 'audio:start-native',
  AUDIO_STOP_NATIVE: 'audio:stop-native',
  AUDIO_SET_AEC_ENABLED: 'audio:set-aec-enabled',
  AUDIO_GET_STATE: 'audio:get-state',
  AUDIO_MIC_DATA: 'audio:mic-data',
  AUDIO_LEVELS: 'audio:levels',
  AUDIO_DATA: 'audio:data',
  AUDIO_GET_SOURCES: 'audio:getSources',

  // Transcription
  TRANSCRIPT_UPDATE: 'transcript:update',
  TRANSCRIPT_FINAL: 'transcript:final',

  // Meetings
  MEETINGS_LIST: 'meetings:list',
  MEETINGS_GET: 'meetings:get',
  MEETINGS_DELETE: 'meetings:delete',
  MEETINGS_SEARCH: 'meetings:search',
  MEETINGS_CREATE_DISMISSED: 'meetings:createDismissed',

  // Callout
  CALLOUT_SHOW: 'callout:show',
  CALLOUT_DISMISS: 'callout:dismiss',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_SET_LOGIN_ITEM: 'settings:setLoginItem',

  // Post-processing
  MEETING_SUMMARIZE: 'meeting:summarize',
  MEETING_EXPORT: 'meeting:export',
  MEETING_NOTES_GENERATING: 'meeting:notesGenerating',
  MEETING_NOTES_COMPLETE: 'meeting:notesComplete',
  MEETING_NOTES_SAVE_MANUAL: 'meeting:saveManualNotes',
  MEETING_ASK_NOTES: 'meeting:askNotes',
  MEETING_UPDATE_TITLE: 'meeting:updateTitle',

  // Chat
  CHAT_SEND_MESSAGE: 'chat:sendMessage',

  // Meeting Prep
  PREP_GENERATE_BRIEFING: 'prep:generateBriefing',
  PREP_GET_TASK_COMMITMENTS: 'prep:getTaskCommitments',
  PREP_TOGGLE_TASK_COMMITMENT: 'prep:toggleTaskCommitment',
  PREP_FETCH_COMPANY_INFO: 'prep:fetchCompanyInfo',

  // Knowledge base
  KNOWLEDGE_INDEX: 'knowledge:index',
  KNOWLEDGE_SEARCH: 'knowledge:search',

  // People/Contacts
  PEOPLE_LIST: 'people:list',
  PEOPLE_SEARCH: 'people:search',
  PEOPLE_GET: 'people:get',
  PEOPLE_UPDATE_NOTES: 'people:updateNotes',
  PEOPLE_UPDATE_NAME: 'people:updateName',
  PEOPLE_UPDATE_ORGANIZATION: 'people:updateOrganization',
  PEOPLE_GET_BY_MEETING: 'people:getByMeeting',
  PEOPLE_STATS: 'people:stats',
  PEOPLE_GET_COMPANIES: 'people:getCompanies',
  PEOPLE_SYNC_FROM_CALENDAR: 'people:syncFromCalendar',

  // Calendar
  CALENDAR_CONNECT: 'calendar:connect',
  CALENDAR_DISCONNECT: 'calendar:disconnect',
  CALENDAR_LIST_TODAY: 'calendar:listToday',
  CALENDAR_GET_UPCOMING: 'calendar:getUpcoming',
  CALENDAR_LINK_EVENT: 'calendar:linkEvent',
  CALENDAR_GET_EVENT_FOR_MEETING: 'calendar:getEventForMeeting',
  CALENDAR_LINK_NOTES: 'calendar:linkNotes',
  CALENDAR_LIST_CALENDARS: 'calendar:listCalendars',
  CALENDAR_SET_VISIBLE_CALENDARS: 'calendar:setVisibleCalendars',

  // CRM
  CRM_CONNECT: 'crm:connect',
  CRM_DISCONNECT: 'crm:disconnect',
  CRM_PUSH_NOTES: 'crm:pushNotes',
  CRM_MEETING_COMPLETE: 'crm:meetingComplete',

  // Dialog
  DIALOG_SELECT_FOLDER: 'dialog:selectFolder',
} as const;

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import type {
  Meeting,
  AppSettings,
  RecordingState,
  AudioLevels,
  TranscriptUpdate,
  TranscriptDeepDiveResult,
  NotesDeepDiveResult,
  EnhancedDeepDiveResult,
  Callout,
  CalendarEvent,
  CalendarAttendee,
  CalendarConnections,
  Person,
  Branch,
  TaskCommitment,
  CompanyInfo,
  MeetingPrepResult,
  EnhancedMeetingPrepResult,
  CRMSnapshot,
  DynamicPrepResult,
  InferredObjective,
  CustomMeetingType,
  ConversationalPrepResult,
  QuickPrepInput,
  // Conversational chat types
  PrepChatInput,
  PrepChatResponse,
  PrepConversation,
} from '@shared/types';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('kakarot', {
  // Recording controls
  recording: {
    start: (calendarContext?: {
      calendarEventId: string;
      calendarEventTitle: string;
      calendarEventAttendees?: (string | CalendarAttendee)[];
      calendarEventStart: string;
      calendarEventEnd: string;
      calendarProvider: string;
    }) => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_START, calendarContext),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_STOP),
    pause: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_PAUSE),
    resume: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_RESUME),
    discard: () => ipcRenderer.invoke(IPC_CHANNELS.RECORDING_DISCARD),
    onStateChange: (callback: (state: RecordingState) => void) => {
      const handler = (_: unknown, state: RecordingState) => callback(state);
      ipcRenderer.on(IPC_CHANNELS.RECORDING_STATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_STATE, handler);
    },
    onAutoStop: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.RECORDING_AUTO_STOPPED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RECORDING_AUTO_STOPPED, handler);
    },
    onNotesComplete: (callback: (data: { meetingId: string; title: string; overview: string }) => void) => {
      const handler = (_: unknown, data: { meetingId: string; title: string; overview: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.MEETING_NOTES_COMPLETE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MEETING_NOTES_COMPLETE, handler);
    },
    onNotificationStartRecording: (callback: (context: any) => void) => {
      const handler = (_: unknown, context: any) => callback(context);
      ipcRenderer.on('notification:start-recording', handler);
      return () => ipcRenderer.removeListener('notification:start-recording', handler);
    },
  },

  // Audio
  audio: {
    onLevels: (callback: (levels: AudioLevels) => void) => {
      const handler = (_: unknown, levels: AudioLevels) => callback(levels);
      ipcRenderer.on(IPC_CHANNELS.AUDIO_LEVELS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_LEVELS, handler);
    },
    sendData: (audioData: ArrayBuffer, source: 'mic' | 'system') => {
      ipcRenderer.send(IPC_CHANNELS.AUDIO_DATA, audioData, source);
    },
  },

  // Indicator
  indicator: {
    onAudioAmplitude: (callback: (level: number) => void) => {
      const handler = (_: unknown, level: number) => callback(level);
      ipcRenderer.on(IPC_CHANNELS.INDICATOR_AUDIO_AMPLITUDE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INDICATOR_AUDIO_AMPLITUDE, handler);
    },
    clicked: () => {
      ipcRenderer.send(IPC_CHANNELS.INDICATOR_CLICKED);
    },
    dragStart: (screenX: number, screenY: number) => {
      ipcRenderer.send(IPC_CHANNELS.INDICATOR_DRAG_START, { screenX, screenY });
    },
    dragMove: (screenX: number, screenY: number) => {
      ipcRenderer.send(IPC_CHANNELS.INDICATOR_DRAG_MOVE, { screenX, screenY });
    },
    dragEnd: () => {
      ipcRenderer.send(IPC_CHANNELS.INDICATOR_DRAG_END);
    },
  },

  // Transcription
  transcript: {
    onUpdate: (callback: (update: TranscriptUpdate) => void) => {
      const handler = (_: unknown, update: TranscriptUpdate) => callback(update);
      ipcRenderer.on(IPC_CHANNELS.TRANSCRIPT_UPDATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSCRIPT_UPDATE, handler);
    },
    onFinal: (callback: (update: TranscriptUpdate) => void) => {
      const handler = (_: unknown, update: TranscriptUpdate) => callback(update);
      ipcRenderer.on(IPC_CHANNELS.TRANSCRIPT_FINAL, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSCRIPT_FINAL, handler);
    },
    deepDive: (meetingId: string, segmentId: string): Promise<TranscriptDeepDiveResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_DEEP_DIVE, meetingId, segmentId),
  },

  // Notes (for AI-generated notes deep dive)
  notes: {
    deepDive: (meetingId: string, noteContent: string): Promise<NotesDeepDiveResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES_DEEP_DIVE, meetingId, noteContent),
    enhancedDeepDive: (meetingId: string, noteBlockText: string): Promise<EnhancedDeepDiveResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.ENHANCED_DEEP_DIVE, meetingId, noteBlockText),
  },

  // Meetings
  meetings: {
    list: (): Promise<Meeting[]> => ipcRenderer.invoke(IPC_CHANNELS.MEETINGS_LIST),
    get: (id: string): Promise<Meeting | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETINGS_GET, id),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETINGS_DELETE, id),
    search: (query: string): Promise<Meeting[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETINGS_SEARCH, query),
    summarize: (id: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETING_SUMMARIZE, id),
    export: (id: string, format: 'markdown' | 'pdf'): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETING_EXPORT, id, format),
    saveManualNotes: (id: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETING_NOTES_SAVE_MANUAL, id, content),
    askNotes: (id: string, query: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETING_ASK_NOTES, id, query),
    updateTitle: (id: string, title: string): Promise<Meeting | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETING_UPDATE_TITLE, id, title),
    updateAttendees: (id: string, attendeeEmails: string[]): Promise<Meeting | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETINGS_UPDATE_ATTENDEES, id, attendeeEmails),
    createDismissed: (title: string, attendeeEmails?: string[]): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEETINGS_CREATE_DISMISSED, title, attendeeEmails),
  },

  // Callout
  callout: {
    onShow: (callback: (callout: Callout) => void) => {
      const handler = (_: unknown, callout: Callout) => callback(callout);
      ipcRenderer.on(IPC_CHANNELS.CALLOUT_SHOW, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CALLOUT_SHOW, handler);
    },
    dismiss: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALLOUT_DISMISS, id),
  },

  // Chat
  chat: {
    sendMessage: (message: string, context?: any): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_MESSAGE, message, context),
  },

  // Meeting Prep
  prep: {
    generateBriefing: (input: any): Promise<MeetingPrepResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_GENERATE_BRIEFING, input),
    generateEnhancedBriefing: (input: any): Promise<EnhancedMeetingPrepResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_GENERATE_ENHANCED_BRIEFING, input),
    getTaskCommitments: (participantEmail: string): Promise<TaskCommitment[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_GET_TASK_COMMITMENTS, participantEmail),
    toggleTaskCommitment: (taskId: string, completed: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_TOGGLE_TASK_COMMITMENT, taskId, completed),
    toggleActionItem: (actionItemId: string, completed: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_TOGGLE_ACTION_ITEM, actionItemId, completed),
    fetchCompanyInfo: (email: string): Promise<CompanyInfo | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_FETCH_COMPANY_INFO, email),
    fetchCRMSnapshot: (email: string): Promise<CRMSnapshot | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_FETCH_CRM_SNAPSHOT, email),
    // Dynamic prep (signal-driven, role-agnostic)
    generateDynamic: (input: {
      meeting: { meeting_type: string; objective: string };
      participants: any[];
      objective?: CustomMeetingType | null;
      calendarEvent?: CalendarEvent | null;
    }): Promise<DynamicPrepResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_GENERATE_DYNAMIC, input),
    inferObjective: (input: {
      calendarEvent?: CalendarEvent | null;
      attendeeEmails: string[];
    }): Promise<InferredObjective> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_INFER_OBJECTIVE, input),
    recordFeedback: (input: {
      insightId: string;
      insightCategory: string;
      feedback: 'useful' | 'not_useful' | 'dismissed';
      participantEmail?: string;
    }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_RECORD_FEEDBACK, input),
    getFeedbackWeights: (): Promise<Record<string, number>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_GET_FEEDBACK_WEIGHTS),
    resetFeedbackWeights: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_RESET_FEEDBACK_WEIGHTS),
    // Conversational prep (Granola-style)
    generateConversational: (input: QuickPrepInput): Promise<ConversationalPrepResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_GENERATE_CONVERSATIONAL, input),
    quickSearchPerson: (query: string): Promise<Person[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_QUICK_SEARCH_PERSON, query),
    // Conversational prep chat (omnibar)
    chatSend: (input: PrepChatInput, existingConversation?: PrepConversation): Promise<PrepChatResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREP_CHAT_SEND, input, existingConversation),
    // Streaming chat for lower perceived latency
    chatStreamStart: (
      input: PrepChatInput,
      existingConversation: PrepConversation | undefined,
      callbacks: {
        onChunk: (chunk: string) => void;
        onStart: (metadata: { conversationId: string; meetingReferences: { meetingId: string; title: string; date: string }[] }) => void;
        onEnd: (response: PrepChatResponse) => void;
        onError: (error: string) => void;
      }
    ): (() => void) => {
      // Set up listeners for streaming events
      const chunkHandler = (_: unknown, chunk: string) => callbacks.onChunk(chunk);
      const startHandler = (_: unknown, metadata: { conversationId: string; meetingReferences: any[] }) => callbacks.onStart(metadata);
      const endHandler = (_: unknown, response: PrepChatResponse) => callbacks.onEnd(response);
      const errorHandler = (_: unknown, error: string) => callbacks.onError(error);

      ipcRenderer.on(IPC_CHANNELS.PREP_CHAT_STREAM_CHUNK, chunkHandler);
      ipcRenderer.on(IPC_CHANNELS.PREP_CHAT_STREAM_START, startHandler);
      ipcRenderer.on(IPC_CHANNELS.PREP_CHAT_STREAM_END, endHandler);
      ipcRenderer.on(IPC_CHANNELS.PREP_CHAT_STREAM_ERROR, errorHandler);

      // Start the stream
      ipcRenderer.invoke(IPC_CHANNELS.PREP_CHAT_STREAM_START, input, existingConversation);

      // Return cleanup function
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.PREP_CHAT_STREAM_CHUNK, chunkHandler);
        ipcRenderer.removeListener(IPC_CHANNELS.PREP_CHAT_STREAM_START, startHandler);
        ipcRenderer.removeListener(IPC_CHANNELS.PREP_CHAT_STREAM_END, endHandler);
        ipcRenderer.removeListener(IPC_CHANNELS.PREP_CHAT_STREAM_ERROR, errorHandler);
      };
    },
  },

  // Settings
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (settings: Partial<AppSettings>): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings),
    setLoginItem: (openAtLogin: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_LOGIN_ITEM, openAtLogin),
    onChange: (callback: (settings: AppSettings) => void) => {
      const handler = (_: unknown, settings: AppSettings) => callback(settings);
      ipcRenderer.on(IPC_CHANNELS.SETTINGS_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_CHANGED, handler);
    },
  },

  // Knowledge base
  knowledge: {
    index: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_INDEX, path),
    search: (query: string): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.KNOWLEDGE_SEARCH, query),
  },

  // People
  people: {
    list: (): Promise<Person[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_LIST),
    search: (query: string): Promise<Person[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_SEARCH, query),
    get: (email: string): Promise<Person | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_GET, email),
    updateNotes: (email: string, notes: string): Promise<Person | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_UPDATE_NOTES, email, notes),
    updateName: (email: string, name: string): Promise<Person | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_UPDATE_NAME, email, name),
    updateOrganization: (email: string, organization: string): Promise<Person | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_UPDATE_ORGANIZATION, email, organization),
    getByMeeting: (meetingId: string): Promise<Person[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_GET_BY_MEETING, meetingId),
    getStats: (): Promise<{ totalPeople: number; totalMeetings: number; avgMeetingsPerPerson: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_STATS),
    getCompanies: (): Promise<{ name: string; domain: string; contactCount: number }[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_GET_COMPANIES),
    syncFromCalendar: (): Promise<{ synced: number; total: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_SYNC_FROM_CALENDAR),
    cleanupNames: (): Promise<{ updated: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_CLEANUP_NAMES),
    populateOrganizations: (): Promise<{ updated: number; failed: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEOPLE_POPULATE_ORGANIZATIONS),
  },

  // Branches
  branches: {
    list: (): Promise<Branch[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_LIST),
    get: (id: string): Promise<Branch | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_GET, id),
    create: (branchData: Omit<Branch, 'createdAt' | 'updatedAt'>): Promise<Branch> =>
      ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_CREATE, branchData),
    update: (id: string, updates: Partial<Omit<Branch, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Branch | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_UPDATE, id, updates),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.BRANCHES_DELETE, id),
  },

  // Calendar
  calendar: {
    connect: (
      provider: 'google' | 'outlook' | 'icloud',
      payload?: { appleId: string; appPassword: string }
    ): Promise<CalendarConnections> => ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_CONNECT, provider, payload),
    disconnect: (provider: 'google' | 'outlook' | 'icloud'): Promise<CalendarConnections> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_DISCONNECT, provider),
    listToday: (): Promise<CalendarEvent[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_LIST_TODAY),
    getUpcoming: (): Promise<CalendarEvent[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_GET_UPCOMING),
    linkEvent: (calendarEventId: string, meetingId: string, provider: 'google' | 'outlook' | 'icloud'): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_LINK_EVENT, calendarEventId, meetingId, provider),
    getEventForMeeting: (meetingId: string): Promise<CalendarEvent | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_GET_EVENT_FOR_MEETING, meetingId),
    linkNotes: (calendarEventId: string, notesId: string, provider: 'google' | 'outlook' | 'icloud'): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_LINK_NOTES, calendarEventId, notesId, provider),
    listCalendars: (provider: 'google' | 'outlook' | 'icloud'): Promise<Array<{ id: string; name: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_LIST_CALENDARS, provider),
    setVisibleCalendars: (provider: 'google' | 'outlook' | 'icloud', ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_SET_VISIBLE_CALENDARS, provider, ids),
  },

  // CRM
  crm: {
    connect: (provider: 'salesforce' | 'hubspot'): Promise<any> =>
      ipcRenderer.invoke(IPC_CHANNELS.CRM_CONNECT, provider),
    disconnect: (provider: 'salesforce' | 'hubspot'): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CRM_DISCONNECT, provider),
    pushNotes: (meetingId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CRM_PUSH_NOTES, meetingId),
    onMeetingComplete: (callback: (data: { meetingId: string; shouldPrompt: boolean; provider?: string }) => void) => {
      const handler = (_: unknown, data: { meetingId: string; shouldPrompt: boolean; provider?: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.CRM_MEETING_COMPLETE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CRM_MEETING_COMPLETE, handler);
    },
  },

  // 👇 NEW: Slack Integration
  slack: {
    connect: (): Promise<any> => ipcRenderer.invoke('slack:connect'),
    getChannels: (token: string): Promise<any[]> => ipcRenderer.invoke('slack:getChannels', token),
    sendNote: (token: string, channelId: string, text: string): Promise<void> => 
      ipcRenderer.invoke('slack:sendNote', { accessToken: token, channelId, text }),
  },

  // Dev utilities
  dev: {
    onResetOnboarding: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('dev:reset-onboarding', handler);
      return () => ipcRenderer.removeListener('dev:reset-onboarding', handler);
    },
  },

  // Dialog
  dialog: {
    selectFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER),
  },
});

// TypeScript declaration for window.kakarot
declare global {
  interface Window {
    kakarot: {
      recording: {
        start: (calendarContext?: {
          calendarEventId: string;
          calendarEventTitle: string;
          calendarEventAttendees?: (string | CalendarAttendee)[];
          calendarEventStart: string;
          calendarEventEnd: string;
          calendarProvider: string;
        }) => Promise<string>;
        stop: () => Promise<Meeting>;
        pause: () => Promise<void>;
        resume: () => Promise<void>;
        discard: () => Promise<void>;
        onStateChange: (callback: (state: RecordingState) => void) => () => void;
        onNotesComplete: (callback: (data: { meetingId: string; title: string; overview: string }) => void) => () => void;
        onNotificationStartRecording: (callback: (context: any) => void) => () => void;
        onAutoStop: (callback: () => void) => () => void;
      };
      audio: {
        onLevels: (callback: (levels: AudioLevels) => void) => () => void;
        sendData: (audioData: ArrayBuffer, source: 'mic' | 'system') => void;
      };
      indicator: {
        onAudioAmplitude: (callback: (level: number) => void) => () => void;
        clicked: () => void;
        dragStart: (screenX: number, screenY: number) => void;
        dragMove: (screenX: number, screenY: number) => void;
        dragEnd: () => void;
      };
      transcript: {
        onUpdate: (callback: (update: TranscriptUpdate) => void) => () => void;
        onFinal: (callback: (update: TranscriptUpdate) => void) => () => void;
        deepDive: (meetingId: string, segmentId: string) => Promise<TranscriptDeepDiveResult>;
      };
      notes: {
        deepDive: (meetingId: string, noteContent: string) => Promise<NotesDeepDiveResult>;
        enhancedDeepDive: (meetingId: string, noteBlockText: string) => Promise<EnhancedDeepDiveResult>;
      };
      meetings: {
        list: () => Promise<Meeting[]>;
        get: (id: string) => Promise<Meeting | null>;
        delete: (id: string) => Promise<void>;
        search: (query: string) => Promise<Meeting[]>;
        summarize: (id: string) => Promise<string>;
        export: (id: string, format: 'markdown' | 'pdf') => Promise<string>;
        saveManualNotes: (id: string, content: string) => Promise<void>;
        askNotes: (id: string, query: string) => Promise<string>;
        updateTitle: (id: string, title: string) => Promise<Meeting | null>;
        updateAttendees: (id: string, attendeeEmails: string[]) => Promise<Meeting | null>;
        createDismissed: (title: string, attendeeEmails?: string[]) => Promise<string>;
      };
      callout: {
        onShow: (callback: (callout: Callout) => void) => () => void;
        dismiss: (id: string) => Promise<void>;
      };
      chat: {
        sendMessage: (message: string, context?: any) => Promise<string>;
      };
      prep: {
        generateBriefing: (input: any) => Promise<MeetingPrepResult>;
        generateEnhancedBriefing: (input: any) => Promise<EnhancedMeetingPrepResult>;
        getTaskCommitments: (participantEmail: string) => Promise<TaskCommitment[]>;
        toggleTaskCommitment: (taskId: string, completed: boolean) => Promise<void>;
        toggleActionItem: (actionItemId: string, completed: boolean) => Promise<void>;
        fetchCompanyInfo: (email: string) => Promise<CompanyInfo | null>;
        fetchCRMSnapshot: (email: string) => Promise<CRMSnapshot | null>;
        // Dynamic prep (signal-driven, role-agnostic)
        generateDynamic: (input: {
          meeting: { meeting_type: string; objective: string };
          participants: any[];
          objective?: CustomMeetingType | null;
          calendarEvent?: CalendarEvent | null;
        }) => Promise<DynamicPrepResult>;
        inferObjective: (input: {
          calendarEvent?: CalendarEvent | null;
          attendeeEmails: string[];
        }) => Promise<InferredObjective>;
        recordFeedback: (input: {
          insightId: string;
          insightCategory: string;
          feedback: 'useful' | 'not_useful' | 'dismissed';
          participantEmail?: string;
        }) => Promise<void>;
        getFeedbackWeights: () => Promise<Record<string, number>>;
        resetFeedbackWeights: () => Promise<void>;
        // Conversational prep (Granola-style)
        generateConversational: (input: QuickPrepInput) => Promise<ConversationalPrepResult>;
        quickSearchPerson: (query: string) => Promise<Person[]>;
        // Conversational prep chat (omnibar)
        chatSend: (input: PrepChatInput, existingConversation?: PrepConversation) => Promise<PrepChatResponse>;
        chatStreamStart: (
          input: PrepChatInput,
          existingConversation: PrepConversation | undefined,
          callbacks: {
            onChunk: (chunk: string) => void;
            onStart: (metadata: { conversationId: string; meetingReferences: { meetingId: string; title: string; date: string }[] }) => void;
            onEnd: (response: PrepChatResponse) => void;
            onError: (error: string) => void;
          }
        ) => () => void;
      };
      settings: {
        get: () => Promise<AppSettings>;
        update: (settings: Partial<AppSettings>) => Promise<void>;
        setLoginItem: (openAtLogin: boolean) => Promise<{ success: boolean }>;
        onChange: (callback: (settings: AppSettings) => void) => () => void;
      };
      knowledge: {
        index: (path: string) => Promise<void>;
        search: (query: string) => Promise<unknown[]>;
      };
      people: {
        list: () => Promise<Person[]>;
        search: (query: string) => Promise<Person[]>;
        get: (email: string) => Promise<Person | null>;
        updateNotes: (email: string, notes: string) => Promise<Person | null>;
        updateName: (email: string, name: string) => Promise<Person | null>;
        updateOrganization: (email: string, organization: string) => Promise<Person | null>;
        getByMeeting: (meetingId: string) => Promise<Person[]>;
        getStats: () => Promise<{ totalPeople: number; totalMeetings: number; avgMeetingsPerPerson: number }>;
        getCompanies: () => Promise<{ name: string; domain: string; contactCount: number }[]>;
        syncFromCalendar: () => Promise<{ synced: number; total: number }>;
        cleanupNames: () => Promise<{ updated: number }>;
        populateOrganizations: () => Promise<{ updated: number; failed: number }>;
      };
      branches: {
        list: () => Promise<Branch[]>;
        get: (id: string) => Promise<Branch | null>;
        create: (branchData: Omit<Branch, 'createdAt' | 'updatedAt'>) => Promise<Branch>;
        update: (id: string, updates: Partial<Omit<Branch, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<Branch | null>;
        delete: (id: string) => Promise<boolean>;
      };
      calendar: {
        connect: (
          provider: 'google' | 'outlook' | 'icloud',
          payload?: { appleId: string; appPassword: string }
        ) => Promise<CalendarConnections>;
        disconnect: (provider: 'google' | 'outlook' | 'icloud') => Promise<CalendarConnections>;
        listToday: () => Promise<CalendarEvent[]>;
        getUpcoming: () => Promise<CalendarEvent[]>;
        linkEvent: (calendarEventId: string, meetingId: string, provider: 'google' | 'outlook' | 'icloud') => Promise<void>;
        getEventForMeeting: (meetingId: string) => Promise<CalendarEvent | null>;
        linkNotes: (calendarEventId: string, notesId: string, provider: 'google' | 'outlook' | 'icloud') => Promise<void>;
        listCalendars: (provider: 'google' | 'outlook' | 'icloud') => Promise<Array<{ id: string; name: string }>>;
        setVisibleCalendars: (provider: 'google' | 'outlook' | 'icloud', ids: string[]) => Promise<void>;
      };
      crm: {
        connect: (provider: 'salesforce' | 'hubspot') => Promise<any>;
        disconnect: (provider: 'salesforce' | 'hubspot') => Promise<void>;
        pushNotes: (meetingId: string) => Promise<void>;
        onMeetingComplete: (callback: (data: { meetingId: string; shouldPrompt: boolean; provider?: string }) => void) => () => void;
      };
      // 👇 NEW: Slack Definitions
      slack: {
        connect: () => Promise<any>;
        getChannels: (token: string) => Promise<any[]>;
        sendNote: (token: string, channelId: string, text: string) => Promise<void>;
      };
      dev: {
        onResetOnboarding: (callback: () => void) => () => void;
      };
      dialog: {
        selectFolder: () => Promise<string | null>;
      };
    };
  }
}

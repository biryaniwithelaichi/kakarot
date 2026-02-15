import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  type Meeting,
  type TranscriptSegment,
  type RecordingState,
  type AudioLevels,
  type AppSettings,
  type CalendarEvent,
} from '@shared/types';

// Type for completed meetings displayed in dashboard
export type CompletedMeeting = Meeting & { endedAt: Date };

// Type for previous meeting display items
export interface PreviousMeetingItem {
  id: string;
  title: string;
  start: Date;
  end: Date;
  hasTranscript: boolean;
  isCalendarEvent: boolean;
}

// Navigation views
export type AppView = 'home' | 'recording' | 'meeting-detail' | 'history' | 'people' | 'settings';

interface NavEntry {
  view: AppView;
  meetingId?: string;
}

const MAX_NAV_DEPTH = 3;

interface AppState {
  // Recording state
  recordingState: RecordingState;
  audioLevels: AudioLevels;
  currentMeetingId: string | null;
  liveTranscript: TranscriptSegment[];
  currentPartials: {
    mic: TranscriptSegment | null;
    system: TranscriptSegment | null;
  };

  // Meetings
  meetings: Meeting[];
  selectedMeeting: Meeting | null;

  // Calendar context
  calendarPreview: CalendarEvent | null; // Calendar event being previewed (renamed from calendarContext)
  recordingContext: CalendarEvent | null; // Calendar event actively being recorded for (renamed from activeCalendarContext)

  // Dashboard data (cached to avoid refetching on view switch)
  liveCalendarEvents: CalendarEvent[];
  upcomingCalendarEvents: CalendarEvent[];
  previousMeetings: PreviousMeetingItem[];
  calendarMappings: Record<string, { notesId?: string }>;
  dismissedEventIds: Set<string>;
  dashboardDataLoaded: boolean;

  // Notes
  lastCompletedNoteId: string | null;

  // Settings (always initialized with defaults)
  settings: AppSettings;

  // Navigation
  view: AppView;
  navStack: NavEntry[];
  initialPrepQuery: string | null;

  // Navigation actions
  navigate: (to: AppView, opts?: { meetingId?: string; replace?: boolean }) => void;
  goBack: () => void;

  // Legacy setView -- calls navigate internally
  setView: (view: AppView) => void;

  // Actions
  setRecordingState: (state: RecordingState) => void;
  setAudioLevels: (levels: AudioLevels) => void;
  setPartialSegment: (segment: TranscriptSegment) => void;
  addTranscriptSegment: (segment: TranscriptSegment) => void;
  updateTranscriptSegment: (segment: TranscriptSegment) => void;
  clearLiveTranscript: () => void;
  setMeetings: (meetings: Meeting[]) => void;
  setSelectedMeeting: (meeting: Meeting | null) => void;
  setCalendarPreview: (event: CalendarEvent | null) => void;
  setRecordingContext: (event: CalendarEvent | null) => void;
  setLastCompletedNoteId: (id: string | null) => void;
  setSettings: (settings: AppSettings) => void;
  setCurrentMeetingId: (id: string | null) => void;
  setInitialPrepQuery: (query: string | null) => void;
  // Dashboard data actions
  setLiveCalendarEvents: (events: CalendarEvent[]) => void;
  setUpcomingCalendarEvents: (events: CalendarEvent[]) => void;
  setPreviousMeetings: (meetings: PreviousMeetingItem[]) => void;
  setCalendarMappings: (mappings: Record<string, { notesId?: string }>) => void;
  setDismissedEventIds: (ids: Set<string>) => void;
  addDismissedEventId: (id: string) => void;
  setDashboardDataLoaded: (loaded: boolean) => void;
}

// Load dismissed event IDs from localStorage
const loadDismissedEventIds = (): Set<string> => {
  try {
    const stored = localStorage.getItem('dismissedEventIds');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const initialNavStack: NavEntry[] = [{ view: 'home' }];

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  recordingState: 'idle',
  audioLevels: { mic: 0, system: 0 },
  currentMeetingId: null,
  liveTranscript: [],
  currentPartials: { mic: null, system: null },
  meetings: [],
  selectedMeeting: null,
  calendarPreview: null,
  recordingContext: null,
  // Dashboard cached data
  liveCalendarEvents: [],
  upcomingCalendarEvents: [],
  previousMeetings: [],
  calendarMappings: {},
  dismissedEventIds: loadDismissedEventIds(),
  dashboardDataLoaded: false,
  lastCompletedNoteId: null,
  settings: DEFAULT_SETTINGS,
  view: 'home',
  navStack: initialNavStack,
  initialPrepQuery: null,

  // Navigation
  navigate: (to, opts) => {
    const state = get();
    const entry: NavEntry = { view: to, meetingId: opts?.meetingId };

    if (opts?.replace) {
      // Replace top of stack
      const stack = [...state.navStack];
      stack[stack.length - 1] = entry;
      set({ navStack: stack, view: to });
    } else {
      // Push, capping at MAX_NAV_DEPTH
      let stack = [...state.navStack, entry];
      if (stack.length > MAX_NAV_DEPTH) {
        stack = stack.slice(stack.length - MAX_NAV_DEPTH);
      }
      set({ navStack: stack, view: to });
    }
  },

  goBack: () => {
    const state = get();
    if (state.navStack.length <= 1) return;
    const stack = state.navStack.slice(0, -1);
    const top = stack[stack.length - 1];
    set({ navStack: stack, view: top.view });
  },

  // Legacy setView wraps navigate
  setView: (view) => {
    // Map old 'recording' view to 'home' for backward compatibility
    const mapped: AppView = view === 'recording' as string ? 'home' : view;
    get().navigate(mapped);
  },

  // Actions
  setRecordingState: (recordingState) => set({ recordingState }),

  setAudioLevels: (audioLevels) => set({ audioLevels }),

  setPartialSegment: (segment) =>
    set((state) => ({
      currentPartials: {
        ...state.currentPartials,
        [segment.source]: segment,
      },
    })),

  addTranscriptSegment: (segment) =>
    set((state) => {
      const existingIndex = state.liveTranscript.findIndex((s) => s.id === segment.id);
      const liveTranscript = existingIndex >= 0
        ? state.liveTranscript.map((s, i) => (i === existingIndex ? segment : s))
        : [...state.liveTranscript, segment];
      return {
        liveTranscript,
        currentPartials: {
          ...state.currentPartials,
          [segment.source]: null,
        },
      };
    }),

  updateTranscriptSegment: (segment) =>
    set((state) => ({
      liveTranscript: state.liveTranscript.map((s) =>
        s.id === segment.id ? segment : s
      ),
    })),

  clearLiveTranscript: () => set({ liveTranscript: [], currentPartials: { mic: null, system: null } }),

  setMeetings: (meetings) => set({ meetings }),

  setSelectedMeeting: (selectedMeeting) => set({ selectedMeeting }),

  setCalendarPreview: (calendarPreview) => set({ calendarPreview }),

  setRecordingContext: (recordingContext) => set({ recordingContext }),

  setLastCompletedNoteId: (lastCompletedNoteId) => set({ lastCompletedNoteId }),

  setSettings: (settings) => set({ settings: { ...DEFAULT_SETTINGS, ...settings } }),

  setCurrentMeetingId: (currentMeetingId) => set({ currentMeetingId }),

  setInitialPrepQuery: (initialPrepQuery) => set({ initialPrepQuery }),

  // Dashboard data actions
  setLiveCalendarEvents: (liveCalendarEvents) => set({ liveCalendarEvents }),

  setUpcomingCalendarEvents: (upcomingCalendarEvents) => set({ upcomingCalendarEvents }),

  setPreviousMeetings: (previousMeetings) => set({ previousMeetings }),

  setCalendarMappings: (calendarMappings) => set({ calendarMappings }),

  setDismissedEventIds: (dismissedEventIds) => {
    localStorage.setItem('dismissedEventIds', JSON.stringify([...dismissedEventIds]));
    return set({ dismissedEventIds });
  },

  addDismissedEventId: (id) =>
    set((state) => {
      const updated = new Set([...state.dismissedEventIds, id]);
      localStorage.setItem('dismissedEventIds', JSON.stringify([...updated]));
      return { dismissedEventIds: updated };
    }),

  setDashboardDataLoaded: (dashboardDataLoaded) => set({ dashboardDataLoaded }),
}));

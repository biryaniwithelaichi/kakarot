import React, { useEffect, useCallback, useState } from 'react';
import { useAppStore, type PreviousMeetingItem } from './stores/appStore';
import { useOnboardingStore } from './stores/onboardingStore';
import RecordingView from './components/RecordingView';
import PrepView from './components/PrepView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import PeopleView from './components/PeopleView';
import Sidebar from './components/Sidebar';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import type { AudioLevels, AppSettings, Meeting } from '../shared/types';
import ThemeToggle from './components/ThemeToggle';
import ToastContainer from './components/Toast';

export default function App() {
  const {
    view,
    recordingState,
    setRecordingState,
    setAudioLevels,
    setPartialSegment,
    addTranscriptSegment,
    setSettings,
    setLiveCalendarEvents,
    setUpcomingCalendarEvents,
    setPreviousMeetings,
    setCalendarMappings,
    setDashboardDataLoaded,
    dashboardDataLoaded,
    dismissedEventIds,
    showRecordingHome,
  } = useAppStore();
  const { isCompleted: onboardingCompleted, completeOnboarding, resetOnboarding } = useOnboardingStore();
  const [pillarTab, setPillarTab] = useState<'notes' | 'prep'>('notes');

  // Determine if we need full-height layout (no scrolling, card fills space)
  const isLiveRecording = recordingState === 'recording' || recordingState === 'paused';
  const needsFullHeight = view === 'history' || view === 'people' || (view === 'recording' && isLiveRecording);

  // Handler that merges incoming audio levels with existing state
  // This allows main process to send partial updates (e.g., just { system: level })
  const handleAudioLevels = useCallback((levels: Partial<AudioLevels>) => {
    const currentLevels = useAppStore.getState().audioLevels;
    setAudioLevels({
      ...currentLevels,
      ...levels,
    });
  }, [setAudioLevels]);

  // Load dashboard data (calendar events and previous meetings)
  const loadDashboardData = useCallback(async () => {
    const currentDismissedIds = useAppStore.getState().dismissedEventIds;

    try {
      // Load calendar events
      const events = await window.kakarot.calendar.getUpcoming();

      // Load calendar mappings
      const settings = await window.kakarot.settings.get() as AppSettings;
      const mappings = settings.calendarEventMappings || {};
      setCalendarMappings(mappings);

      const now = Date.now();
      const oneMinute = 60_000;

      // Upcoming: events whose start is more than 1 minute away
      const upcoming = events.filter((e) => new Date(e.start).getTime() - now > oneMinute);
      setUpcomingCalendarEvents(upcoming);

      // Live: events currently between start and end (not dismissed)
      const live = events.filter((e) => {
        const startMs = new Date(e.start).getTime();
        const endMs = new Date(e.end).getTime();
        return now >= startMs && now <= endMs && !currentDismissedIds.has(e.id);
      });
      setLiveCalendarEvents(live);
    } catch (err) {
      console.error('Failed to load calendar events:', err);
    }

    try {
      // Load previous meetings
      const meetings = await window.kakarot.meetings.list();
      const now = Date.now();
      const completed = meetings
        .filter((m): m is Meeting & { endedAt: Date } => m.endedAt !== null)
        .filter((m) => new Date(m.endedAt).getTime() < now)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((m): PreviousMeetingItem => ({
          id: m.id,
          title: m.title,
          start: new Date(m.createdAt),
          end: new Date(m.endedAt),
          hasTranscript: m.transcript.length > 0,
          isCalendarEvent: false,
        }));
      setPreviousMeetings(completed);
    } catch (err) {
      console.error('Failed to load previous meetings:', err);
    }

    setDashboardDataLoaded(true);
  }, [setLiveCalendarEvents, setUpcomingCalendarEvents, setPreviousMeetings, setCalendarMappings, setDashboardDataLoaded]);

  useEffect(() => {
    // Load initial settings
    window.kakarot.settings.get().then(setSettings);

    // Dev-only: Listen for onboarding reset shortcut (Cmd/Ctrl+Shift+O)
    const unsubDevReset = window.kakarot.dev.onResetOnboarding(() => {
      console.log('[DEV] Resetting onboarding via keyboard shortcut');
      resetOnboarding();
    });

    // Subscribe to recording state changes
    const unsubState = window.kakarot.recording.onStateChange(setRecordingState);

    // Subscribe to audio levels (handler merges partial updates)
    const unsubLevels = window.kakarot.audio.onLevels(handleAudioLevels);

    // Subscribe to transcript updates (partials replace, finals append)
    const unsubTranscript = window.kakarot.transcript.onUpdate((update) => {
      setPartialSegment(update.segment);
    });

    const unsubFinal = window.kakarot.transcript.onFinal((update) => {
      addTranscriptSegment(update.segment);
    });

    return () => {
      unsubDevReset();
      unsubState();
      unsubLevels();
      unsubTranscript();
      unsubFinal();
    };
  }, [setRecordingState, handleAudioLevels, setPartialSegment, addTranscriptSegment, setSettings, resetOnboarding]);

  // Load dashboard data at startup and refresh periodically
  useEffect(() => {
    // Initial load
    loadDashboardData();

    // Refresh every 30 seconds to keep live/upcoming meetings current
    const intervalId = setInterval(loadDashboardData, 30_000);

    // Listen for notes completion to refresh previous meetings
    const unsubNotesComplete = window.kakarot.recording.onNotesComplete?.(() => {
      setTimeout(loadDashboardData, 500);
    });

    return () => {
      clearInterval(intervalId);
      if (unsubNotesComplete) unsubNotesComplete();
    };
  }, [loadDashboardData]);

  // Track previous recording state to detect when recording ends
  const prevRecordingStateRef = React.useRef(recordingState);
  useEffect(() => {
    // Refresh dashboard data when recording ends (transitions from recording to idle)
    if (prevRecordingStateRef.current === 'recording' && recordingState === 'idle' && dashboardDataLoaded) {
      setTimeout(loadDashboardData, 300);
    }
    prevRecordingStateRef.current = recordingState;
  }, [recordingState, dashboardDataLoaded, loadDashboardData]);

  // Show onboarding if not completed
  if (!onboardingCompleted) {
    return <OnboardingFlow onComplete={completeOnboarding} />;
  }

  return (
    <div className="flex h-screen min-w-[640px] bg-[#050505]">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {/* Fixed Header */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-[#0C0C0C]/80 border-b-2 border-[#4ea8dd]/30 drag-region">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[48px] flex items-center justify-between">
            {/* Back button (left, sticks to sidebar edge) */}
            <div className="flex items-center no-drag">
              {(() => {
                // Determine if we're on the homepage (BentoDashboard)
                const isOnHomepage = view === 'recording' && pillarTab === 'notes' && (recordingState === 'idle' || showRecordingHome);

                return (
                  <button
                    disabled={isOnHomepage}
                    className={`px-3 py-1.5 rounded-md text-sm transition ${
                      isOnHomepage
                        ? 'text-slate-600 cursor-not-allowed'
                        : 'text-slate-300 hover:bg-white/5 cursor-pointer'
                    }`}
                    onClick={() => {
                      if (isOnHomepage) return;
                      const state = useAppStore.getState();
                      const currentlyLive = state.recordingState === 'recording' || state.recordingState === 'paused';

                      // Navigate to home screen
                      state.setView('recording');
                      setPillarTab('notes');
                      state.setActiveCalendarContext(null);
                      state.setCalendarContext(null);
                      state.setSelectedMeeting(null);
                      state.setShowRecordingHome(currentlyLive);
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      ← Back
                    </span>
                  </button>
                );
              })()}
            </div>
            {/* Navigation Pills (Center) */}
            <div className="flex-1 flex justify-center no-drag">
              <div className="flex items-center gap-2 px-1.5 py-1.5 rounded-full border border-white/10 bg-[#0C0C0C]/70">
                {(['notes','prep'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setPillarTab(tab);
                      const state = useAppStore.getState();
                      // Switch to recording view when clicking any tab
                      if (state.view !== 'recording') {
                        state.setView('recording');
                      }
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                      pillarTab === tab && view === 'recording'
                        ? 'bg-[#4ea8dd] text-white shadow-soft-card'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {tab === 'notes' ? 'Home' : 'Prep'}
                  </button>
                ))}
              </div>
            </div>

            {/* Spacer for layout balance */}
            <div className="w-32" />
          </div>
        </header>

        {/* Scrollable Content */}
        <main className={`flex-1 ${needsFullHeight ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={`${view === 'recording' ? 'h-full' : 'max-w-6xl mx-auto px-4 sm:px-6'} ${needsFullHeight ? 'h-full flex flex-col py-4' : 'py-6'}`}>
            <div className={`rounded-2xl border border-white/10 bg-[#121212] shadow-soft-card ${needsFullHeight ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
              <div className={`${needsFullHeight ? 'h-full flex flex-col p-4' : 'p-4 sm:p-6'}`}>
                {view === 'recording' && (
                  pillarTab === 'notes' ? (
                    <RecordingView onSelectTab={setPillarTab} />
                  ) : (
                    <PrepView onSelectTab={setPillarTab} />
                  )
                )}
                {view === 'history' && <HistoryView />}
                {view === 'people' && <PeopleView />}
                {view === 'settings' && <SettingsView />}
              </div>
            </div>
          </div>
        </main>
      </div>
      <ToastContainer />
      <ThemeToggle />
    </div>
  );
}

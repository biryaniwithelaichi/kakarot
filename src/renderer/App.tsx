import React, { useEffect, useCallback, useState } from 'react';
import { useAppStore, type PreviousMeetingItem } from './stores/appStore';
import { useOnboardingStore } from './stores/onboardingStore';
import RecordingView from './components/RecordingView';
import PrepView from './components/PrepView';
import HomeView from './components/HomeView';
import MeetingDetailView from './components/MeetingDetailView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import PeopleView from './components/PeopleView';
import Sidebar from './components/Sidebar';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { ArrowLeft } from 'lucide-react';
import type { AudioLevels, AppSettings, CalendarEvent, Meeting } from '../shared/types';
import ThemeToggle from './components/ThemeToggle';
import ToastContainer from './components/Toast';

export default function App() {
  const {
    view,
    navStack,
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
    goBack,
    navigate,
    selectedMeeting,
    lastCompletedNoteId,
  } = useAppStore();
  const { isCompleted: onboardingCompleted, completeOnboarding, resetOnboarding } = useOnboardingStore();
  const [pillarTab, setPillarTab] = useState<'notes' | 'prep'>('notes');
  const [cachedCalendarEvents, setCachedCalendarEvents] = useState<CalendarEvent[]>([]);

  const classifyCalendarEvents = useCallback(
    (events: CalendarEvent[], dismissedIds: Set<string>) => {
      const now = Date.now();
      const oneMinute = 60_000;
      const upcoming = events.filter((event) => {
        const eventStart = new Date(event.start).getTime();
        const status = event.status?.toLowerCase();
        const isCancelled = event.isCancelled || status === 'cancelled';
        return !isCancelled && eventStart - now > oneMinute;
      });

      const live = events.filter((event) => {
        const eventStart = new Date(event.start).getTime();
        const eventEnd = new Date(event.end).getTime();
        const status = event.status?.toLowerCase();
        const isCancelled = event.isCancelled || status === 'cancelled';
        if (isCancelled) return false;
        const windowStart = eventStart - oneMinute;
        const isWithinWindow = now >= windowStart && now <= eventEnd;
        return isWithinWindow && !dismissedIds.has(event.id);
      });

      setUpcomingCalendarEvents(upcoming);
      setLiveCalendarEvents(live);
    },
    [setLiveCalendarEvents, setUpcomingCalendarEvents]
  );

  useEffect(() => {
    classifyCalendarEvents(cachedCalendarEvents, dismissedEventIds);
  }, [cachedCalendarEvents, dismissedEventIds, classifyCalendarEvents]);

  useEffect(() => {
    if (cachedCalendarEvents.length === 0) return;
    const interval = setInterval(() => {
      classifyCalendarEvents(cachedCalendarEvents, dismissedEventIds);
    }, 5000);
    return () => clearInterval(interval);
  }, [cachedCalendarEvents, dismissedEventIds, classifyCalendarEvents]);

  // Full-height layout logic
  const isLiveRecording = recordingState === 'recording' || recordingState === 'paused';
  const needsFullHeight = view === 'history' || view === 'people' || view === 'recording' || view === 'meeting-detail' || (view === 'home' && (isLiveRecording || pillarTab === 'prep'));

  const handleAudioLevels = useCallback((levels: Partial<AudioLevels>) => {
    const currentLevels = useAppStore.getState().audioLevels;
    setAudioLevels({ ...currentLevels, ...levels });
  }, [setAudioLevels]);

  const loadDashboardData = useCallback(async () => {
    const currentDismissedIds = useAppStore.getState().dismissedEventIds;

    try {
      const events = await window.kakarot.calendar.getUpcoming();
      setCachedCalendarEvents(events);
      classifyCalendarEvents(events, currentDismissedIds);

      const settings = await window.kakarot.settings.get() as AppSettings;
      const mappings = settings.calendarEventMappings || {};
      setCalendarMappings(mappings);
    } catch (err) {
      console.error('Failed to load calendar events:', err);
    }

    try {
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
  }, [classifyCalendarEvents, setPreviousMeetings, setCalendarMappings, setDashboardDataLoaded]);

  useEffect(() => {
    window.kakarot.settings.get().then(setSettings);
    const unsubDevReset = window.kakarot.dev.onResetOnboarding(() => {
      console.log('[DEV] Resetting onboarding via keyboard shortcut');
      resetOnboarding();
    });
    const unsubState = window.kakarot.recording.onStateChange(setRecordingState);
    const unsubLevels = window.kakarot.audio.onLevels(handleAudioLevels);
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

  useEffect(() => {
    loadDashboardData();
    const intervalId = setInterval(loadDashboardData, 30_000);
    const unsubNotesComplete = window.kakarot.recording.onNotesComplete?.(() => {
      setTimeout(loadDashboardData, 500);
    });
    const unsubSettingsChange = window.kakarot.settings.onChange?.(() => {
      setTimeout(loadDashboardData, 100);
    });
    return () => {
      clearInterval(intervalId);
      if (unsubNotesComplete) unsubNotesComplete();
      if (unsubSettingsChange) unsubSettingsChange();
    };
  }, [loadDashboardData]);

  const prevRecordingStateRef = React.useRef(recordingState);
  useEffect(() => {
    if (prevRecordingStateRef.current === 'recording' && recordingState === 'idle' && dashboardDataLoaded) {
      setTimeout(loadDashboardData, 300);
    }
    prevRecordingStateRef.current = recordingState;
  }, [recordingState, dashboardDataLoaded, loadDashboardData]);

  if (!onboardingCompleted) {
    return <OnboardingFlow onComplete={completeOnboarding} />;
  }

  const isOnHome = navStack.length <= 1 && view === 'home';

  // handleStartRecording is passed to HomeView; RecordingView manages the actual recording
  const handleStartRecording = (event?: CalendarEvent) => {
    // Set calendar context if an event is passed, then navigate to recording
    if (event) {
      useAppStore.getState().setCalendarPreview(event);
      useAppStore.getState().setRecordingContext(event);
    }
    navigate('recording');
  };

  const renderContent = () => {
    switch (view) {
      case 'home':
        if (pillarTab === 'prep') {
          return <PrepView onSelectTab={setPillarTab} />;
        }
        return (
          <HomeView
            onStartRecording={handleStartRecording}
            isRecordingActive={isLiveRecording}
            recordingTitle={undefined}
            onBackToMeeting={() => navigate('recording')}
            onSelectTab={setPillarTab}
          />
        );

      case 'recording':
        return <RecordingView onSelectTab={setPillarTab} />;

      case 'meeting-detail':
        if (selectedMeeting) {
          const isNew = lastCompletedNoteId === selectedMeeting.id;
          return <MeetingDetailView meeting={selectedMeeting} isNewlyCompleted={isNew} />;
        }
        return null;

      case 'history':
        return <HistoryView />;

      case 'people':
        return <PeopleView />;

      case 'settings':
        return <SettingsView />;

      default:
        return null;
    }
  };

  const isFullWidthView = view === 'history' || view === 'people' || view === 'meeting-detail';

  return (
    <div className="flex h-screen overflow-hidden min-w-[640px] bg-[#0C0C0C]">
      <Sidebar pillarTab={pillarTab} onPillarTabChange={setPillarTab} />
      <div className="flex-1 flex flex-col">
        {/* Fixed Header */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-[#0C0C0C]/80 border-b border-[#2A2A2A] drag-region">
          <div className="px-4 sm:px-6 h-[48px] flex items-center">
            <div className="flex items-center no-drag">
              <button
                disabled={isOnHome}
                className={`px-3 py-1.5 rounded-md text-sm transition ${
                  isOnHome
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-300 hover:bg-white/5 cursor-pointer'
                }`}
                onClick={() => {
                  if (isOnHome) return;
                  goBack();
                }}
              >
                <span className="inline-flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className={`flex-1 ${needsFullHeight ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div
            key={`${view}-${pillarTab}`}
            className={`
              animate-view-enter
              ${needsFullHeight ? 'h-full flex flex-col' : ''}
              py-4 px-4 sm:px-6
              ${!isFullWidthView ? 'max-w-5xl mx-auto' : ''}
            `}
          >
            {isFullWidthView ? (
              <div className={needsFullHeight ? 'flex-1 min-h-0 flex flex-col' : ''}>
                {renderContent()}
              </div>
            ) : (
              <div className={`rounded-2xl border border-[#2A2A2A] bg-[#161616] ${needsFullHeight ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
                <div className={`${needsFullHeight ? 'h-full flex flex-col p-5' : 'p-5 sm:p-6'}`}>
                  {renderContent()}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      <ToastContainer />
      <ThemeToggle />
    </div>
  );
}

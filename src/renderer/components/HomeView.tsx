import { useState, useEffect, useMemo } from 'react';
import { Search, Mic } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import BentoDashboard from './bento/BentoDashboard';
import RecordingBanner from './RecordingBanner';
import SearchPopup from './SearchPopup';
import type { CalendarEvent } from '@shared/types';

interface HomeViewProps {
  onStartRecording: (event?: CalendarEvent) => void;
  isRecordingActive: boolean;
  recordingTitle?: string;
  onBackToMeeting?: () => void;
  onSelectTab?: (tab: 'notes' | 'prep') => void;
}

export default function HomeView({
  onStartRecording,
  isRecordingActive,
  recordingTitle,
  onBackToMeeting,
  onSelectTab,
}: HomeViewProps) {
  const { recordingState, upcomingCalendarEvents, liveCalendarEvents } = useAppStore();
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [userFirstName, setUserFirstName] = useState('User');

  const isRecording = recordingState === 'recording';
  const isPaused = recordingState === 'paused';
  const isGenerating = recordingState === 'processing';

  useEffect(() => {
    window.kakarot.settings.get().then((settings) => {
      if (settings.userProfile?.name) {
        setUserFirstName(settings.userProfile.name.split(' ')[0]);
      }
    });
  }, []);

  const statusLine = useMemo(() => {
    // Live meeting takes priority
    if (liveCalendarEvents.length > 0) {
      const live = liveCalendarEvents[0];
      return `${live.title} is live now`;
    }

    // Count today's upcoming meetings
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const todayEvents = upcomingCalendarEvents.filter(
      (e) => new Date(e.start).getTime() <= todayEnd.getTime()
    );

    if (todayEvents.length > 0) {
      const next = todayEvents[0];
      const minutesUntil = Math.floor(
        (new Date(next.start).getTime() - now.getTime()) / 60000
      );

      if (minutesUntil <= 0) {
        return `${next.title} starting now`;
      }
      if (minutesUntil < 60) {
        const more = todayEvents.length > 1
          ? ` -- ${todayEvents.length - 1} more today`
          : '';
        return `${next.title} in ${minutesUntil} min${more}`;
      }

      const count = todayEvents.length;
      return `${count} meeting${count > 1 ? 's' : ''} today, next in ${minutesUntil} min`;
    }

    return 'No meetings scheduled today';
  }, [liveCalendarEvents, upcomingCalendarEvents]);

  return (
    <>
      <div className="flex-1 min-h-0 text-cream flex flex-col">
        <div className="w-full flex flex-col flex-1 min-h-0">
          {/* Greeting + Action Row */}
          <div className="flex-shrink-0 mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 space-y-4 animate-view-enter">
            <div>
              <p className="text-sm text-muted">{statusLine}</p>
              <h1 className="text-2xl font-medium tracking-tight text-cream mt-1">
                What are you working on, {userFirstName}?
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
                <input
                  type="text"
                  placeholder="Search meetings or notes"
                  className="w-full pl-10 pr-4 py-2.5 bg-input border border-edge rounded-md text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent/30 transition-colors cursor-pointer"
                  onClick={() => setShowSearchPopup(true)}
                  onFocus={() => setShowSearchPopup(true)}
                  readOnly
                />
              </div>

              <button
                onClick={() => onStartRecording()}
                disabled={isRecording || isPaused || isGenerating}
                className="px-4 py-2.5 bg-accent text-surface font-medium rounded-lg flex items-center gap-2 shadow-soft transition-colors duration-150 hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 text-sm"
              >
                <Mic className="w-3.5 h-3.5" />
                Take Notes
              </button>
            </div>
          </div>

          {/* Dashboard */}
          <div className="w-full flex justify-center flex-1 min-h-0 px-4 sm:px-6">
            <div className="w-full max-w-2xl flex flex-col flex-1 min-h-0">
              {isRecordingActive ? (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="flex-shrink-0 pt-4 sm:pt-6 pb-2">
                    <RecordingBanner
                      title={recordingTitle || ''}
                      onBackToMeeting={() => onBackToMeeting?.()}
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto pb-4 sm:pb-6">
                    <BentoDashboard
                      isRecording={isRecording || isPaused}
                      hideCompactBarWhenNoEvents={true}
                      onStartNotes={onStartRecording}
                      onSelectTab={onSelectTab}
                    />
                  </div>
                </div>
              ) : (
                <BentoDashboard
                  isRecording={isRecording || isPaused}
                  onStartNotes={onStartRecording}
                  onSelectTab={onSelectTab}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <SearchPopup
        isOpen={showSearchPopup}
        onClose={() => setShowSearchPopup(false)}
      />
    </>
  );
}

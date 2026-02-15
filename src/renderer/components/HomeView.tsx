import { useState, useEffect } from 'react';
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
  const { recordingState } = useAppStore();
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return `Good Morning, ${userFirstName}`;
    if (hour >= 12 && hour < 22) return `Good Afternoon, ${userFirstName}`;
    return `Good Evening, ${userFirstName}`;
  };

  return (
    <>
      <div className="flex-1 min-h-0 text-[#F0EBE3] flex flex-col">
        <div className="w-full flex flex-col flex-1 min-h-0">
          {/* Greeting + Action Row */}
          <div className="flex-shrink-0 mx-auto w-full max-w-2xl px-4 sm:px-6 py-4 space-y-3 animate-view-enter">
            <div>
              <h1 className="text-4xl font-display text-[#F0EBE3]">
                {getGreeting()}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5C5750]" />
                <input
                  type="text"
                  placeholder="Search meetings or notes"
                  className="w-full pl-10 pr-4 py-2 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl text-sm text-[#F0EBE3] placeholder:text-[#5C5750] focus:outline-none focus:ring-1 focus:ring-[#C17F3E]/30 focus:border-[#C17F3E]/20 transition cursor-pointer"
                  onClick={() => setShowSearchPopup(true)}
                  onFocus={() => setShowSearchPopup(true)}
                  readOnly
                />
              </div>

              <button
                onClick={() => onStartRecording()}
                disabled={isRecording || isPaused || isGenerating}
                className="px-4 py-2 bg-[#C17F3E] text-[#0C0C0C] font-semibold rounded-xl flex items-center gap-1.5 shadow-copper-soft transition-all duration-200 hover:bg-[#D4923F] hover:shadow-copper-glow active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 text-sm"
              >
                <Mic className="w-3.5 h-3.5" />
                Start Recording
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

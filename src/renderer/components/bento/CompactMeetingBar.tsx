import type { CalendarEvent } from '../../../shared/types';
import { Calendar, FileText, Clipboard, Trash2 } from 'lucide-react';

interface CompactMeetingBarProps {
  events: CalendarEvent[];
  isRecording: boolean;
  hideWhenNoEvents?: boolean;
  onStartNotes: (event?: CalendarEvent) => void;
  onPrep?: () => void;
  onDismiss?: (eventId: string) => void;
}

export default function CompactMeetingBar({
  events,
  isRecording,
  hideWhenNoEvents,
  onStartNotes,
  onPrep,
  onDismiss,
}: CompactMeetingBarProps) {
  const formatTime = (date: Date): string => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMinutesUntil = (start: Date): number => {
    return Math.floor((new Date(start).getTime() - Date.now()) / 60000);
  };

  const getPlatformIcon = (location?: string) => {
    if (!location) return null;
    const lower = location.toLowerCase();
    if (lower.includes('zoom')) return 'Zoom';
    if (lower.includes('meet') || lower.includes('google')) return 'Meet';
    if (lower.includes('teams')) return 'Teams';
    return null;
  };

  if (!events || events.length === 0) {    // If hideWhenNoEvents is true (e.g., during background recording), don't show the "No Meeting Going on" message
    if (hideWhenNoEvents) {
      return null;
    }
    return (
      <div className="w-full rounded-xl border border-[#2A2A2A] bg-[#161616] px-4 py-2 flex items-center justify-start">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-white">No Meeting Going on</p>
            <p className="text-[11px] text-slate-400">We'll surface your meeting here when it's live.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {events.map((event, index) => {
        const minutesUntil = getMinutesUntil(event.start);
        const isLive = minutesUntil <= 0 && new Date(event.end).getTime() - Date.now() > 0;
        const platform = getPlatformIcon(event.location);

        return (
          <div key={event.id} className="rounded-xl border border-[#2A2A2A] bg-[#161616] px-4 py-2 flex items-center justify-between animate-stagger-in" style={{ animationDelay: `${index * 60}ms` }}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {isLive && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#4ea8dd]/15 border border-[#4ea8dd]/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ea8dd] animate-pulse" />
                  <span className="text-[10px] font-semibold text-[#3d96cb] uppercase tracking-wider">Live</span>
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white truncate">{event.title}</h3>
                  {platform && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#2A2A2A]/80 text-slate-300">
                      {platform}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {formatTime(event.start)} – {formatTime(event.end)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
              {onDismiss && (
                <button
                  onClick={() => onDismiss(event.id)}
                  className="p-1.5 text-slate-500 text-slate-400 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/20"
                  title="Remove from live bar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onStartNotes(event)}
                disabled={isRecording}
                className="px-3 py-1.5 bg-[#4ea8dd] text-[#0C0C0C] text-sm font-semibold rounded-lg shadow-soft transition-all duration-200 hover:bg-[#3d96cb] hover:shadow-soft active:scale-[0.97] disabled:opacity-50 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                Start Notes
              </button>
              {onPrep && (
                <button
                  onClick={onPrep}
                  className="px-3 py-1.5 bg-[#1E1E1E] text-[#9C9690] text-sm font-medium rounded-lg border border-[#2A2A2A] transition hover:bg-[#2A2A2A] hover:text-[#F0EBE3] flex items-center gap-1.5"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  Prep
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
      <div className="w-full rounded-lg border border-edge bg-card px-4 py-3 flex items-center justify-start shadow-elevated">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-dim" />
          <div>
            <p className="text-sm font-medium text-cream">No meeting right now</p>
            <p className="text-[11px] text-dim">We'll surface your meeting here when it's live.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {events.map((event) => {
        const minutesUntil = getMinutesUntil(event.start);
        const isLive = minutesUntil <= 0 && new Date(event.end).getTime() - Date.now() > 0;
        const platform = getPlatformIcon(event.location);

        return (
          <div key={event.id} className="rounded-lg border border-edge bg-card px-4 py-3 flex items-center justify-between shadow-elevated">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {isLive && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent/10 border border-accent/15">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent recording-indicator" />
                  <span className="text-[10px] font-medium text-accent uppercase tracking-wider">Live</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-cream truncate">{event.title}</h3>
                  {platform && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-edge text-muted">
                      {platform}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted mt-0.5">
                  {formatTime(event.start)} -- {formatTime(event.end)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
              {onDismiss && (
                <button
                  onClick={() => onDismiss(event.id)}
                  className="p-1.5 text-dim hover:text-status-error transition-colors rounded-md hover:bg-status-error/10"
                  title="Remove from live bar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onStartNotes(event)}
                disabled={isRecording}
                className="px-3 py-1.5 bg-accent text-surface text-sm font-medium rounded-lg shadow-soft transition-colors hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Start Notes</span>
              </button>
              {onPrep && (
                <button
                  onClick={onPrep}
                  className="px-3 py-1.5 bg-input text-muted text-sm font-medium rounded-lg border border-edge transition-colors hover:bg-edge hover:text-cream flex items-center gap-1.5"
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

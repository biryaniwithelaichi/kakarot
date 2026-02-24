import { Calendar, FileText, Plus } from 'lucide-react';

interface Meeting {
  id: string;
  title: string;
  start: Date;
  end: Date;
  hasTranscript?: boolean;
  isCalendarEvent?: boolean;
  onViewNotes?: () => void;
}

interface PreviousMeetingsListProps {
  meetings: Meeting[];
  onViewNotes?: (id: string) => void;
  onViewCalendarEventNotes?: (id: string) => void;
  onViewMore?: () => void;
}

export default function PreviousMeetingsList({ meetings, onViewNotes, onViewCalendarEventNotes, onViewMore }: PreviousMeetingsListProps) {
  const formatDate = (date: Date): string => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  };

  const formatTime = (date: Date): string => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleMeetingClick = (meeting: Meeting) => {
    if (meeting.onViewNotes) {
      meeting.onViewNotes();
    } else if (meeting.isCalendarEvent) {
      onViewCalendarEventNotes?.(meeting.id);
    } else {
      onViewNotes?.(meeting.id);
    }
  };

  return (
    <div className="h-full rounded-lg border border-edge bg-card p-4 flex flex-col shadow-elevated">
      <h3 className="text-[11px] uppercase tracking-[0.15em] font-medium text-dim mb-3 px-1">
        Previous meetings
      </h3>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Calendar className="w-8 h-8 text-dim mb-2 opacity-50" />
            <p className="text-sm text-dim">No previous meetings</p>
          </div>
        ) : (
          meetings.map((meeting) => (
            <button
              key={meeting.id}
              onClick={() => handleMeetingClick(meeting)}
              className="w-full px-3 py-2 rounded-md bg-input border border-edge hover:bg-edge transition-colors text-left active:scale-[0.98]"
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-shrink-0 px-2 py-1 rounded bg-edge border border-edge-light">
                  <p className="text-[10px] font-medium text-muted leading-tight">
                    {formatDate(meeting.start)}
                  </p>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-cream truncate">
                    {meeting.title}
                  </h4>
                  <p className="text-xs text-dim mt-1">
                    {formatTime(meeting.start)} -- {formatTime(meeting.end)}
                  </p>

                  <div className="mt-2">
                    {meeting.hasTranscript ? (
                      <span className="text-xs text-accent font-medium flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        View notes
                      </span>
                    ) : (
                      <span className="text-xs text-accent font-medium flex items-center gap-1">
                        <Plus className="w-3 h-3" />
                        Add notes
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {onViewMore && (
        <button
          onClick={onViewMore}
          className="mt-3 w-full py-2 text-sm font-medium text-accent hover:bg-edge rounded-md transition-colors"
        >
          View more
        </button>
      )}
    </div>
  );
}

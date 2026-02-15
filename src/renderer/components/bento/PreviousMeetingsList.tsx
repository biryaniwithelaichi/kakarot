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
    <div className="h-full rounded-xl border border-[#2A2A2A] bg-[#161616] p-3 flex flex-col">
      <h3 className="text-xs uppercase tracking-widest font-semibold text-slate-400 mb-3 px-1">
        Previous Meetings
      </h3>
      
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Calendar className="w-8 h-8 text-slate-500 mb-2 opacity-50" />
            <p className="text-sm text-slate-500">No previous meetings</p>
          </div>
        ) : (
          meetings.map((meeting, index) => (
            <button
              key={meeting.id}
              onClick={() => handleMeetingClick(meeting)}
              className="w-full px-3 py-2 rounded-lg bg-[#1E1E1E] border border-[#2A2A2A] hover:bg-[#2A2A2A] transition-all duration-200 text-left hover:shadow-elevated active:scale-[0.98] animate-stagger-in"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-shrink-0 px-2 py-1 rounded bg-[#2A2A2A] border border-[#2A2A2A]">
                  <p className="text-[10px] font-bold text-slate-400 leading-tight">
                    {formatDate(meeting.start)}
                  </p>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-slate-200 truncate">
                    {meeting.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {formatTime(meeting.start)} – {formatTime(meeting.end)}
                  </p>
                  
                  <div className="mt-2">
                    {meeting.hasTranscript ? (
                      <span className="text-xs text-[#4ea8dd] font-medium flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        View Notes
                      </span>
                    ) : (
                      <span className="text-xs text-[#4ea8dd] font-medium flex items-center gap-1">
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
          className="mt-3 w-full py-2 text-sm font-medium text-[#4ea8dd] hover:bg-[#2A2A2A] rounded-lg transition-colors"
        >
          View more
        </button>
      )}
    </div>
  );
}

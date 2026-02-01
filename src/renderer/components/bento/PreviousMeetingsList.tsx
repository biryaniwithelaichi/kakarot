import React from 'react';
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
    <div className="h-full rounded-xl border border-[#4ea8dd]/40 dark:border-[#4ea8dd]/40 bg-[#0C0C0F] backdrop-blur-md shadow-[0_10px_50px_rgba(78,168,221,0.25)] p-3 flex flex-col opacity-90">
      <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3 px-1">
        Previous Meetings
      </h3>
      
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Calendar className="w-8 h-8 text-slate-400 dark:text-slate-600 mb-2 opacity-50" />
            <p className="text-sm text-slate-500 dark:text-slate-500">No previous meetings</p>
          </div>
        ) : (
          meetings.map((meeting) => (
            <button
              key={meeting.id}
              onClick={() => handleMeetingClick(meeting)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50/30 dark:bg-slate-800/20 border border-slate-200/40 dark:border-slate-700/40 hover:bg-slate-100/40 dark:hover:bg-slate-700/30 transition-colors text-left"
            >
              <div className="flex items-start gap-2.5">
                <div className="flex-shrink-0 px-2 py-1 rounded bg-slate-200/40 dark:bg-slate-700/30 border border-slate-300/30 dark:border-slate-600/30">
                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 leading-tight">
                    {formatDate(meeting.start)}
                  </p>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-400 truncate">
                    {meeting.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    {formatTime(meeting.start)} – {formatTime(meeting.end)}
                  </p>
                  
                  <div className="mt-2">
                    {meeting.hasTranscript ? (
                      <span className="text-xs text-[#4ea8dd] dark:text-[#4ea8dd] font-medium flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        View Notes
                      </span>
                    ) : (
                      <span className="text-xs text-[#4ea8dd] dark:text-[#4ea8dd] font-medium flex items-center gap-1">
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
          className="mt-3 w-full py-2 text-sm font-medium text-[#4ea8dd] dark:text-[#4ea8dd] hover:bg-slate-100/40 dark:hover:bg-slate-700/30 rounded-lg transition-colors"
        >
          ...View More
        </button>
      )}
    </div>
  );
}

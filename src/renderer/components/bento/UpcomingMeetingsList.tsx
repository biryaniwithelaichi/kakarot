import type { CalendarEvent } from '../../../shared/types';
import { Calendar, Settings } from 'lucide-react';

interface UpcomingMeetingsListProps {
  meetings: CalendarEvent[];
  isCalendarConnected?: boolean;
  onNavigateSettings?: () => void;
  onSelectMeeting?: (meeting: CalendarEvent) => void;
  onTakeNotes?: (meeting: CalendarEvent) => void;
  onViewMore?: () => void;
}

export default function UpcomingMeetingsList({ meetings, isCalendarConnected = false, onNavigateSettings, onSelectMeeting: _onSelectMeeting, onTakeNotes, onViewMore }: UpcomingMeetingsListProps) {
  const formatDate = (date: Date): string => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  };

  const formatTime = (date: Date): string => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    const d = new Date(date);
    return d.toDateString() === today.toDateString();
  };

  const isTomorrow = (date: Date): boolean => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const d = new Date(date);
    return d.toDateString() === tomorrow.toDateString();
  };

  const renderMeeting = (meeting: CalendarEvent, index?: number): JSX.Element => (
    <button
      key={meeting.id}
      onClick={() => onTakeNotes?.(meeting)}
      className="w-full px-3 py-2 rounded-lg bg-[#1E1E1E] border border-[#2A2A2A] hover:bg-[#2A2A2A] transition-all duration-200 text-left hover:shadow-elevated active:scale-[0.98] animate-stagger-in"
      style={{ animationDelay: `${(index ?? 0) * 40}ms` }}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex-shrink-0 px-2 py-1 rounded bg-[#4ea8dd]/10 border border-[#4ea8dd]/15">
          <p className="text-[10px] font-bold text-[#3d96cb] leading-tight tracking-wider">
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
        </div>
      </div>
    </button>
  );

  const MeetingSection = (props: {
    label: string;
    meetings: CalendarEvent[];
    emptyMessage?: string;
    renderMeeting: (meeting: CalendarEvent, index: number) => JSX.Element;
  }): JSX.Element => (
    <div>
      <h4 className="text-[10px] uppercase tracking-[0.2em] font-medium text-[#5C5750] mb-2 px-1">
        {props.label}
      </h4>
      <div className="space-y-2">
        {props.meetings.length > 0 ? (
          props.meetings.map((meeting, index) => props.renderMeeting(meeting, index))
        ) : (
          <p className="text-xs text-slate-500 px-1">{props.emptyMessage}</p>
        )}
      </div>
    </div>
  );

  // Limit total displayed meetings to 5
  const displayedMeetings = meetings.slice(0, 5);
  const hasMore = meetings.length > 5;
  
  const displayedToday = displayedMeetings.filter(m => isToday(m.start));
  const displayedTomorrow = displayedMeetings.filter(m => isTomorrow(m.start));
  const displayedLater = displayedMeetings.filter(m => !isToday(m.start) && !isTomorrow(m.start));

  return (
    <div className="h-full rounded-xl border border-[#2A2A2A] bg-[#161616] p-3 flex flex-col">
      <h3 className="text-xs uppercase tracking-[0.2em] font-medium text-[#5C5750] mb-3 px-1 flex-shrink-0">
        Upcoming Meetings
      </h3>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Calendar className="w-8 h-8 text-slate-500 mb-2 opacity-50" />
            {isCalendarConnected ? (
              <>
                <p className="text-sm text-slate-500">No upcoming meetings</p>
                <p className="text-xs text-slate-500 mt-1">Your calendar is connected but there are no events scheduled</p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">No calendar connected</p>
                <p className="text-xs text-slate-500 mt-1 mb-3">Connect your calendar to see upcoming meetings</p>
                {onNavigateSettings && (
                  <button
                    onClick={onNavigateSettings}
                    className="px-3 py-1.5 bg-[#4ea8dd] hover:bg-[#3d96cb] text-[#0C0C0C] text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <Settings className="w-3 h-3" />
                    Connect Calendar
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {displayedToday.length > 0 && (
              <MeetingSection
                label="TODAY"
                meetings={displayedToday}
                emptyMessage="No meetings today"
                renderMeeting={renderMeeting}
              />
            )}

            {displayedTomorrow.length > 0 && (
              <MeetingSection
                label="TOMORROW"
                meetings={displayedTomorrow}
                renderMeeting={renderMeeting}
              />
            )}

            {displayedLater.length > 0 && (
              <MeetingSection
                label="LATER"
                meetings={displayedLater}
                renderMeeting={renderMeeting}
              />
            )}
          </>
        )}
      </div>
      
      {hasMore && onViewMore && (
        <div className="mt-2 pt-2 border-t border-[#2A2A2A] flex-shrink-0">
          <button
            onClick={() => onViewMore?.()}
            className="w-full text-xs text-[#4ea8dd] hover:text-[#3d96cb] font-medium text-center transition-colors"
          >
            View more
          </button>
        </div>
      )}
    </div>
  );
}

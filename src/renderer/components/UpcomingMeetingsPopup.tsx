import { useEffect, useRef } from 'react';
import { X, Calendar } from 'lucide-react';
import type { CalendarEvent } from '@shared/types';

interface UpcomingMeetingsPopupProps {
  onClose: () => void;
  meetings: CalendarEvent[];
  onSelectMeeting?: (meeting: CalendarEvent) => void;
  onTakeNotes?: (meeting: CalendarEvent) => void;
}

export default function UpcomingMeetingsPopup({ onClose, meetings, onSelectMeeting }: UpcomingMeetingsPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const formatDate = (date: Date): string => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
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

  // Group meetings by time period
  const todayMeetings = meetings.filter(m => isToday(m.start));
  const tomorrowMeetings = meetings.filter(m => isTomorrow(m.start));
  const laterMeetings = meetings.filter(m => !isToday(m.start) && !isTomorrow(m.start));

  const renderMeetingButton = (meeting: CalendarEvent) => (
    <button
      key={meeting.id}
      onClick={() => {
        onSelectMeeting?.(meeting);
        onClose();
      }}
      className="w-full px-3 py-3 rounded-lg bg-[#1E1E1E]/40 border border-slate-700/40 hover:bg-[#2A2A2A]/40 hover:border-[#4ea8dd]/50 transition-all text-left group"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 px-2.5 py-1 rounded bg-[#4ea8dd]/20 border border-[#4ea8dd]/30">
          <p className="text-[11px] font-bold text-[#4ea8dd] leading-tight">
            {formatDate(meeting.start)}
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-slate-200 group-hover:text-white truncate transition-colors">
            {meeting.title}
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            {formatTime(meeting.start)} – {formatTime(meeting.end)}
          </p>
        </div>
      </div>
    </button>
  );

  const MeetingSection = (props: { label: string; meetings: CalendarEvent[] }): JSX.Element | null => {
    if (props.meetings.length === 0) return null;
    return (
      <div>
        <h4 className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 dark:text-slate-500 mb-2 px-1">
          {props.label}
        </h4>
        <div className="space-y-2">
          {props.meetings.map(meeting => renderMeetingButton(meeting))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        ref={containerRef}
        className="relative w-full max-w-md max-h-96 bg-[#0C0C0C] rounded-xl border border-[#4ea8dd]/40 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">Upcoming Meetings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#2A2A2A]/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {meetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <Calendar className="w-8 h-8 text-slate-400 mb-2 opacity-50" />
              <p className="text-sm text-slate-400">No upcoming meetings</p>
            </div>
          ) : (
            <>
              {todayMeetings.length > 0 && (
                <MeetingSection label="TODAY" meetings={todayMeetings} />
              )}
              {tomorrowMeetings.length > 0 && (
                <MeetingSection label="TOMORROW" meetings={tomorrowMeetings} />
              )}
              {laterMeetings.length > 0 && (
                <MeetingSection label="LATER" meetings={laterMeetings} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

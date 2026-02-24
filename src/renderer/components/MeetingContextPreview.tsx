import React from 'react';
import type { CalendarEvent } from '@shared/types';
import { Calendar, Clock, Users, MapPin, FileText, X, Sparkles, Mic } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

interface MeetingContextPreviewProps {
  meeting: CalendarEvent;
  onDismiss?: () => void;
  onPrep?: (meeting: CalendarEvent) => void;
  onTranscribeNow?: (meeting: CalendarEvent) => void;
}

export default function MeetingContextPreview({ meeting, onDismiss, onPrep, onTranscribeNow }: MeetingContextPreviewProps): JSX.Element {
  const { navigate, setSelectedPersonEmail } = useAppStore();

  const sanitizeDescription = (input?: string): string => {
    if (!input) return '';
    return input
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };
  const formatTime = (date: Date): string => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const duration = Math.round((meeting.end.getTime() - meeting.start.getTime()) / (1000 * 60));

  const getAttendeeEmail = (attendee: any): string | undefined => {
    if (!attendee) return undefined;
    return typeof attendee === 'string' ? attendee : attendee.email;
  };

  const getAttendeeLabel = (attendee: any): string => {
    if (!attendee) return '';
    if (typeof attendee === 'string') return attendee;
    return attendee.name || attendee.email || '';
  };

  const handleAttendeeClick = (email?: string) => {
    if (!email) return;
    setSelectedPersonEmail(email);
    navigate('people');
    onDismiss?.();
  };

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-input rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 border border-slate-200 dark:border-edge">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
              MEETING CONTEXT
            </p>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
              {meeting.title}
            </h2>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Details Grid */}
        <div className="space-y-3 mb-6">
          {/* Date & Time */}
          <div className="flex items-center gap-3 text-sm">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-slate-700 dark:text-slate-300">
                {formatDate(meeting.start)} • {formatTime(meeting.start)} – {formatTime(meeting.end)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {duration} minutes
              </p>
            </div>
          </div>

          {/* Location */}
          {meeting.location && (
            <div className="flex items-start gap-3 text-sm">
              <div className="p-2 rounded-lg bg-accent/10 flex-shrink-0">
                <MapPin className="w-4 h-4 text-accent dark:text-accent" />
              </div>
              <p className="text-slate-700 dark:text-slate-300 break-all overflow-hidden flex-1">{meeting.location}</p>
            </div>
          )}

          {/* Attendees */}
          {meeting.attendees && meeting.attendees.length > 0 && (
            <div className="flex items-start gap-3 text-sm">
              <div className="p-2 rounded-lg bg-cream/10 flex-shrink-0">
                <Users className="w-4 h-4 text-green-600 dark:text-cream" />
              </div>
              <div className="flex-1">
                <p className="text-slate-600 dark:text-slate-400 text-xs font-medium mb-1">
                  {meeting.attendees.length} attendee{meeting.attendees.length !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-1 max-h-28 overflow-auto pr-1">
                  {meeting.attendees.map((attendee, i) => {
                    const email = getAttendeeEmail(attendee);
                    const disabled = !email;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleAttendeeClick(email)}
                        disabled={disabled}
                        className={`inline-flex items-center px-2 py-1 rounded text-xs truncate transition-colors ${
                          disabled
                            ? 'bg-input dark:bg-card text-slate-600 dark:text-slate-500 cursor-default'
                            : 'bg-input dark:bg-card text-slate-700 dark:text-slate-300 hover:bg-edge hover:text-white'
                        }`}
                        title={email || undefined}
                      >
                        {getAttendeeLabel(attendee)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Description/Agenda */}
          {meeting.description && (
            <div className="flex items-start gap-3 text-sm">
              <div className="p-2 rounded-lg bg-orange-500/10 flex-shrink-0">
                <FileText className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-600 dark:text-slate-400 text-xs font-medium mb-1">
                  Agenda
                </p>
                <p className="text-slate-700 dark:text-slate-300 text-sm line-clamp-3 overflow-hidden break-words whitespace-pre-line">
                  {sanitizeDescription(meeting.description)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Calendar Badge */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-input dark:bg-card mb-6">
          <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {meeting.provider === 'google' && 'Google Calendar'}
            {meeting.provider === 'outlook' && 'Microsoft Outlook'}
            {meeting.provider === 'icloud' && 'iCloud Calendar'}
            {meeting.provider === 'unknown' && 'Calendar'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => {
              onPrep?.(meeting);
              onDismiss?.();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-accent/10 border border-accent/30 hover:bg-accent/20 hover:border-accent/50 transition-all text-accent font-medium text-sm"
          >
            <Sparkles className="w-4 h-4" />
            Prep
          </button>
          <button
            onClick={() => {
              onTranscribeNow?.(meeting);
              onDismiss?.();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition-all text-red-500 dark:text-red-400 font-medium text-sm"
          >
            <Mic className="w-4 h-4" />
            Transcribe Now
          </button>
        </div>

        {/* Info text */}
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          Your meeting notes will be automatically linked to this calendar event
        </p>
      </div>
    </div>
  );
}

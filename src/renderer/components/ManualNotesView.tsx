import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { Clock, Users, BookOpen, ChevronDown, X, Video, Calendar as CalendarIcon } from 'lucide-react';
import googleMeetPng from '../assets/google-meet.png';
import googleCalendarPng from '../assets/google-calendar.png';
import AttendeesList from './AttendeesList';

interface ManualNotesViewProps {
  meetingId?: string;
  onSelectTab?: (tab: 'notes' | 'prep') => void;
  onSaveNotes?: () => void;
  onStartRecording?: () => void;
}

export default function ManualNotesView({ meetingId, onSelectTab, onSaveNotes, onStartRecording }: ManualNotesViewProps) {
  const { recordingContext, calendarPreview, setInitialPrepQuery } = useAppStore();
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showTimePopover, setShowTimePopover] = useState(false);
  const timeButtonRef = useRef<HTMLButtonElement>(null);
  const timePopoverRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(false);

  const meeting = recordingContext || calendarPreview;
  
  // Load existing notes on mount
  useEffect(() => {
    const loadNotes = async () => {
      if (!meetingId || initialLoadRef.current) return;
      
      try {
        const meetingData = await window.kakarot.meetings.get(meetingId);
        if (meetingData?.noteEntries) {
          // Find the most recent manual note
          const manualNotes = meetingData.noteEntries
            .filter(entry => entry.type === 'manual')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          if (manualNotes.length > 0) {
            setNotes(manualNotes[0].content);
            setLastSaved(new Date(manualNotes[0].createdAt));
          }
        }
        initialLoadRef.current = true;
      } catch (error) {
        console.error('Failed to load existing notes:', error);
      }
    };
    
    loadNotes();
  }, [meetingId]);
  
  const meetingTitle = meeting?.title || 'Untitled Meeting';
  const meetingTime = meeting ? new Date(meeting.start).toLocaleString([], { 
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }) : '';

  const getMeetingPlatform = () => {
    if (!meeting?.location) return null;
    const location = meeting.location.toLowerCase();

    if (location.includes('zoom.us') || location.includes('zoom.com') || location.includes('zoom'))
      return { name: 'Zoom', type: 'zoom', url: meeting.location };
    if (location.includes('meet.google') || location.includes('google.com/meet') || location.includes('meet'))
      return { name: 'Google Meet', type: 'google-meet', url: meeting.location };
    if (location.includes('teams.microsoft') || location.includes('teams.live.com') || location.includes('teams'))
      return { name: 'Microsoft Teams', type: 'teams', url: meeting.location };
    if (location.includes('webex') || location.includes('cisco'))
      return { name: 'Cisco Webex', type: 'webex', url: meeting.location };
    if (location.includes('hangout'))
      return { name: 'Google Hangouts', type: 'hangouts', url: meeting.location };

    return null;
  };

  // Get calendar provider display info
  const getCalendarProviderInfo = () => {
    const provider = meeting?.provider;
    switch (provider) {
      case 'google':
        return { name: 'Google Calendar', type: 'google', color: '#4285F4' };
      case 'outlook':
        return { name: 'Outlook Calendar', type: 'outlook', color: '#0078D4' };
      case 'icloud':
        return { name: 'Apple Calendar', type: 'icloud', color: '#555555' };
      default:
        return { name: 'Calendar', type: 'default', color: '#808080' };
    }
  };

  const getCalendarEventUrl = () => {
    if (!meeting?.id) return null;
    const provider = meeting?.provider;
    switch (provider) {
      case 'google':
        // For Google Calendar, construct URL to search/view the event
        return `https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent(meeting.title)}`;
      case 'outlook':
        // For Outlook, direct to calendar
        return 'https://outlook.office.com/calendar';
      case 'icloud':
        // For iCloud, direct to calendar
        return 'https://www.icloud.com/calendar';
      default:
        return null;
    }
  };

  const meetingPlatform = getMeetingPlatform();
  const calendarProvider = getCalendarProviderInfo();
  const calendarEventUrl = getCalendarEventUrl();

  const handleJoinMeeting = () => {
    const url = meetingPlatform?.url || meeting?.location;
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleOpenCalendar = () => {
    if (calendarEventUrl) {
      window.open(calendarEventUrl, '_blank');
    }
  };

  // Render logo for meeting platform
  const renderPlatformLogo = (type: string) => {
    switch (type) {
      case 'google-meet':
        return (
          <img
            src={googleMeetPng}
            alt="Google Meet"
            className="w-7 h-7 object-contain"
          />
        );
      case 'teams':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M19.5 3H4.5C3.67157 3 3 3.67157 3 4.5V19.5C3 20.3284 3.67157 21 4.5 21H19.5C20.3284 21 21 20.3284 21 19.5V4.5C21 3.67157 20.3284 3 19.5 3Z" fill="#5059C9"/>
            <circle cx="12" cy="12" r="4" fill="white"/>
            <path d="M10 10H14V14H10V10Z" fill="#5059C9"/>
          </svg>
        );
      case 'zoom':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2" fill="#2D8CFF"/>
            <path d="M8 10L14 13L8 16V10Z" fill="white"/>
          </svg>
        );
      default:
        return <Video className="w-4 h-4" />;
    }
  };

  // Render logo for calendar provider
  const renderCalendarLogo = (type: string) => {
    switch (type) {
      case 'google':
        return (
          <img
            src={googleCalendarPng}
            alt="Google Calendar"
            className="w-7 h-7 object-contain"
          />
        );
      case 'outlook':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" fill="#0078D4"/>
            <path d="M12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8Z" fill="white"/>
          </svg>
        );
      case 'icloud':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" fill="#E63946"/>
            <text x="12" y="10" textAnchor="middle" fill="white" fontSize="7" fontWeight="600">WED</text>
            <text x="12" y="17" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">28</text>
          </svg>
        );
      default:
        return <CalendarIcon className="w-4 h-4" />;
    }
  };

  // Autosave function
  const saveNotes = useCallback(async (content: string) => {
    if (!content.trim() || !meetingId) return;

    setIsSaving(true);
    try {
      await window.kakarot.meetings.saveManualNotes(meetingId, content);
      setLastSaved(new Date());
      onSaveNotes?.();
    } catch (error) {
      console.error('Failed to autosave notes:', error);
    } finally {
      setIsSaving(false);
    }
  }, [meetingId, onSaveNotes]);

  // Debounced autosave on notes change
  useEffect(() => {
    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Don't save on initial load
    if (!initialLoadRef.current) return;

    // Set new timer for 1 second debounce
    if (notes.trim()) {
      saveTimerRef.current = setTimeout(() => {
        saveNotes(notes);
      }, 1000);
    }

    // Cleanup on unmount
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [notes, saveNotes]);

  // Close time popover when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        timePopoverRef.current && !timePopoverRef.current.contains(target) &&
        timeButtonRef.current && !timeButtonRef.current.contains(target)
      ) {
        setShowTimePopover(false);
      }
    };
    
    if (showTimePopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTimePopover]);

  const duration = meeting ? Math.round((meeting.end.getTime() - meeting.start.getTime()) / (1000 * 60)) : 0;
  const formattedDate = meeting ? new Date(meeting.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  const formattedTime = meeting ? new Date(meeting.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const endTime = meeting ? new Date(meeting.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="flex-1 h-full bg-gradient-to-br from-[#0C0C0C] via-[#0D0D0F] to-[#0C0C14] text-slate-ink dark:text-[#F0EBE3] flex flex-col overflow-hidden">
      <div className="w-full flex justify-center flex-1 overflow-hidden px-4 sm:px-6 py-4 sm:py-6">
        <div className="w-full max-w-4xl flex flex-col flex-1 min-h-0 gap-4">
          {/* Header Section */}
          <div className="flex-shrink-0 overflow-visible relative z-10">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 sm:p-5 overflow-visible">
              {/* Meeting Title */}
              <h1 className="text-2xl font-semibold text-white mb-3">
                {meetingTitle}
              </h1>

              {/* Meeting Metadata */}
              <div className="flex items-center gap-3 text-sm flex-wrap relative">
                <div className="relative">
                  <button 
                    ref={timeButtonRef}
                    onClick={() => setShowTimePopover(!showTimePopover)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition text-slate-200"
                  >
                    <Clock className="w-4 h-4" />
                    <span>{meetingTime}</span>
                    <ChevronDown className="w-4 h-4 opacity-50" />
                  </button>

                  {showTimePopover && (
                    <div
                      ref={timePopoverRef}
                      className="absolute top-full left-0 mt-2 bg-[#0C0C0C] dark:bg-[#0C0C0C] rounded-xl border border-slate-800 dark:border-[#2A2A2A] shadow-2xl z-50 overflow-hidden min-w-max"
                    >
                      {/* Header */}
                      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-white">Meeting Time</h3>
                        <button
                          onClick={() => setShowTimePopover(false)}
                          className="p-1 text-slate-400 hover:text-slate-200 transition rounded hover:bg-[#1E1E1E]/50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Content */}
                      <div className="p-4 space-y-4">
                        <div>
                          <p className="text-xs text-slate-400 uppercase font-medium mb-1">Date</p>
                          <p className="text-sm text-white font-medium">{formattedDate}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 uppercase font-medium mb-1">Time</p>
                          <p className="text-sm text-white font-medium">{formattedTime} – {endTime}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 uppercase font-medium mb-1">Duration</p>
                          <p className="text-sm text-white font-medium">{duration} minutes</p>
                        </div>

                        {/* Meeting Platform */}
                        {meetingPlatform && (
                          <div className="pt-2 border-t border-slate-800">
                            <button
                              onClick={handleJoinMeeting}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#C17F3E] to-[#C17F3E] hover:from-[#D4923F] hover:to-[#D4923F] text-white text-xs font-medium rounded-lg transition"
                            >
                              <div className="w-7 h-7 flex items-center justify-center">
                                {renderPlatformLogo(meetingPlatform.type)}
                              </div>
                              Join {meetingPlatform.name}
                            </button>
                          </div>
                        )}

                        {/* Calendar Provider */}
                        <div className="pt-2 border-t border-slate-800">
                          <button 
                            onClick={handleOpenCalendar}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1E1E1E] hover:bg-[#2A2A2A] text-white text-xs font-medium rounded-lg transition"
                            style={calendarProvider.type !== 'default' ? { backgroundColor: `${calendarProvider.color}20`, borderColor: calendarProvider.color } : undefined}
                          >
                            <div className="w-7 h-7 flex items-center justify-center">
                              {calendarProvider.type === 'default' ? (
                                <CalendarIcon className="w-4 h-4" />
                              ) : (
                                renderCalendarLogo(calendarProvider.type)
                              )}
                            </div>
                            Open in {calendarProvider.name}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <AttendeesList 
                  attendeeEmails={
                    meeting?.attendees
                      ? meeting.attendees.map((a: any) => 
                          typeof a === 'string' ? a : a.email
                        )
                      : []
                  } 
                />
              </div>
            </div>
          </div>

          {/* Notes Editor */}
          <div className="flex-1 min-h-0 relative z-0">
            <div className="h-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 sm:p-5 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Write notes..."
                  className="w-full h-full resize-none bg-transparent text-lg text-white placeholder-slate-400 focus:outline-none leading-relaxed"
                />
              </div>

              {/* Bottom Bar */}
              <div className="flex-shrink-0 pt-4 mt-4 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>{notes.length} characters</span>
                  {isSaving && (
                    <span className="text-amber-400">Saving...</span>
                  )}
                  {!isSaving && lastSaved && (
                    <span className="text-emerald-400">
                      Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {onStartRecording && (
                    <button
                      onClick={onStartRecording}
                      className="px-3 py-2 rounded-lg bg-[#1E1E1E] dark:bg-[#2A2A2A] hover:bg-[#2A2A2A] dark:hover:bg-[#C17F3E] text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors"
                    >
                      Transcribe Now
                    </button>
                  )}
                  <button
                    onClick={() => {
                      // Build attendee names for the prep query
                      const attendeeNames = meeting?.attendees
                        ?.map((a: any) => {
                          if (typeof a === 'string') {
                            // If it's just an email, extract name from email
                            const localPart = a.split('@')[0];
                            return localPart.split(/[._-]/)
                              .filter((part: string) => part.length > 0)
                              .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                              .join(' ');
                          }
                          // If it's an object with name, prefer that
                          if (a.name) return a.name;
                          // Fallback to extracting from email
                          const localPart = a.email.split('@')[0];
                          return localPart.split(/[._-]/)
                            .filter((part: string) => part.length > 0)
                            .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                            .join(' ');
                        })
                        .filter(Boolean)
                        .join(', ');

                      if (attendeeNames) {
                        setInitialPrepQuery(`Help me prepare for a meeting with ${attendeeNames}`);
                      }
                      onSelectTab?.('prep');
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-mist hover:bg-emerald-mist/90 text-onyx font-medium transition-colors flex items-center gap-2"
                  >
                    <BookOpen className="w-4 h-4" />
                    Prep
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
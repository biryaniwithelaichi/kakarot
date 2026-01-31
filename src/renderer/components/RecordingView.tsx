import React from 'react';
import { useAppStore } from '../stores/appStore';
import { useAudioCapture } from '../hooks/useAudioCapture';
import AudioLevelMeter from './AudioLevelMeter';
import LiveTranscript from './LiveTranscript';
import BentoDashboard from './bento/BentoDashboard';
import AskNotesBar from './AskNotesBar';
import ManualNotesView from './ManualNotesView';
import MeetingContextPreview from './MeetingContextPreview';
import AttendeesList from './AttendeesList';
import SearchPopup from './SearchPopup';
import { FileText, Square, Search, Loader2, Calendar as CalendarIcon, Users, Folder, Share2, Copy, Check, X, ScrollText, MessageSquare, Clock3, Clock, ChevronDown } from 'lucide-react';
import { formatDateTime } from '../lib/formatters';
import type { CalendarEvent, AppSettings } from '@shared/types';

interface RecordingViewProps {
  onSelectTab?: (tab: 'notes' | 'prep' | 'interact') => void;
}

type LiveCalloutEntry = {
  id: string;
  type: 'question' | 'mention';
  text: string;
  context: string;
  source: 'mic' | 'system';
  timestampMs: number;
};

export default function RecordingView({ onSelectTab }: RecordingViewProps) {
  const { recordingState, audioLevels, liveTranscript, currentPartials, clearLiveTranscript, calendarContext, setCalendarContext, activeCalendarContext, setActiveCalendarContext, setLastCompletedNoteId, setSelectedMeeting, setView, currentMeetingId, setCurrentMeetingId, showRecordingHome, setShowRecordingHome } = useAppStore();
  const { startCapture, stopCapture } = useAudioCapture();
  const [pillarTab, setPillarTab] = React.useState<'notes' | 'prep' | 'interact'>('notes');
  const [recordingTitle, setRecordingTitle] = React.useState<string>(''); // Title to display during recording
  const [upcomingMeetingId, setUpcomingMeetingId] = React.useState<string | null>(null); // Meeting ID for upcoming notes
  type MeetingPhase = 'recording' | 'processing' | 'completed' | 'error';
  const [phase, setPhase] = React.useState<MeetingPhase>('recording');
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const [completedMeeting, setCompletedMeeting] = React.useState<any>(null);
  const [aiResponse, setAiResponse] = React.useState<string>('');
  const [titleInput, setTitleInput] = React.useState<string>('');
  const [isSavingTitle, setIsSavingTitle] = React.useState<boolean>(false);
  const [showSharePopover, setShowSharePopover] = React.useState<boolean>(false);
  const [shareCopied, setShareCopied] = React.useState<boolean>(false);
  const shareRef = React.useRef<HTMLDivElement | null>(null);
  const [showCRMPrompt, setShowCRMPrompt] = React.useState<boolean>(false);
  const [pendingCRMMeetingId, setPendingCRMMeetingId] = React.useState<string | null>(null);
  const [crmProvider, setCRMProvider] = React.useState<'salesforce' | 'hubspot' | null>(null);
  const [isPushingNotes, setIsPushingNotes] = React.useState<boolean>(false);
  const [showManualNotes, setShowManualNotes] = React.useState<boolean>(false);
  const [notes, setNotes] = React.useState<string>('');
  const [showTranscriptPopover, setShowTranscriptPopover] = React.useState<boolean>(false);
  const [showSearchPopup, setShowSearchPopup] = React.useState<boolean>(false);
  const [calloutTimeline, setCalloutTimeline] = React.useState<LiveCalloutEntry[]>([]);
  const [showTimePopover, setShowTimePopover] = React.useState<boolean>(false);
  const [showParticipantsPopover, setShowParticipantsPopover] = React.useState<boolean>(false);
  const timeButtonRef = React.useRef<HTMLButtonElement>(null);
  const timePopoverRef = React.useRef<HTMLDivElement>(null);
  const participantsButtonRef = React.useRef<HTMLButtonElement>(null);
  const participantsPopoverRef = React.useRef<HTMLDivElement>(null);
  const processedSegmentsRef = React.useRef<Set<string>>(new Set());
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isIdle = recordingState === 'idle';
  const isRecording = recordingState === 'recording';
  const isPaused = recordingState === 'paused';
  const isGenerating = phase === 'processing';

  // Forward tab changes to parent if handler provided
  const handleSelectTab = (tab: 'notes' | 'prep' | 'interact') => {
    setPillarTab(tab);
    onSelectTab?.(tab);
  };

  // Load existing manual notes when showing split view
  React.useEffect(() => {
    const loadNotes = async () => {
      if (showManualNotes && upcomingMeetingId) {
        try {
          const meetingData = await window.kakarot.meetings.get(upcomingMeetingId);
          if (meetingData?.noteEntries) {
            const manualNotes = meetingData.noteEntries
              .filter(entry => entry.type === 'manual')
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            
            if (manualNotes.length > 0) {
              setNotes(manualNotes[0].content);
            }
          }
        } catch (error) {
          console.error('Failed to load existing notes:', error);
        }
      }
    };
    
    loadNotes();
  }, [showManualNotes, upcomingMeetingId]);

  // Autosave notes when typing
  React.useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (notes.trim() && upcomingMeetingId && showManualNotes) {
      saveTimerRef.current = setTimeout(async () => {
        try {
          await window.kakarot.meetings.saveManualNotes(upcomingMeetingId, notes);
        } catch (error) {
          console.error('Failed to autosave notes:', error);
        }
      }, 1000);
    }

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [notes, upcomingMeetingId, showManualNotes]);

  // Initialize meeting when entering manual notes view for upcoming meetings
  React.useEffect(() => {
    if (isIdle && pillarTab === 'notes' && (activeCalendarContext || calendarContext) && !upcomingMeetingId) {
      const meeting = activeCalendarContext || calendarContext;
      if (meeting) {
        // Check if this calendar event already has linked notes; if so, reuse that meeting ID
        window.kakarot.settings.get()
          .then((settings) => {
            const mappings = (settings as AppSettings).calendarEventMappings || {};
            const existing = mappings[meeting.id];
            if (existing?.notesId) {
              setUpcomingMeetingId(existing.notesId);
              console.log('[RecordingView] Using existing notes meeting for upcoming event:', existing.notesId);
              return null; // signal no creation needed
            }
            // Create a new meeting entry for upcoming calendar event notes (without starting recording)
            const attendeeEmails = meeting.attendees?.map((a: any) => typeof a === 'string' ? a : a.email) || [];
            return window.kakarot.meetings.createDismissed(meeting.title, attendeeEmails)
              .then(async (meetingId: string) => {
                setUpcomingMeetingId(meetingId);
                console.log('[RecordingView] Created meeting for upcoming notes:', meetingId);
                try {
                  await window.kakarot.calendar.linkNotes(meeting.id, meetingId, meeting.provider as 'google' | 'outlook' | 'icloud');
                  console.log('[RecordingView] Linked notes to calendar event:', meeting.id);
                } catch (linkErr) {
                  console.warn('[RecordingView] Failed to link notes to calendar event:', linkErr);
                }
                return meetingId;
              });
          })
          .catch((err) => {
            console.error('[RecordingView] Failed initializing manual notes meeting:', err);
          });
      }
    }
  }, [isIdle, pillarTab, activeCalendarContext, calendarContext, upcomingMeetingId]);

  const [userFirstName, setUserFirstName] = React.useState('User');

  // Fetch user name from settings
  React.useEffect(() => {
    window.kakarot.settings.get().then((settings) => {
      if (settings.userProfile?.name) {
        const firstName = settings.userProfile.name.split(' ')[0];
        setUserFirstName(firstName);
      }
    });
  }, []);

  // Lightweight inline callout detection until the Python classifier is wired up
  React.useEffect(() => {
    if (!(isRecording || isPaused)) return;

    const nameLower = userFirstName?.toLowerCase();
    const newSegments = liveTranscript.filter(
      (segment) => segment.isFinal && !processedSegmentsRef.current.has(segment.id)
    );

    if (!newSegments.length) return;

    newSegments.forEach((segment) => {
      processedSegmentsRef.current.add(segment.id);
      const text = segment.text.trim();
      if (!text) return;

      const lower = text.toLowerCase();
      const mentionsName = nameLower ? lower.includes(nameLower) : false;
      const isQuestionLike =
        text.includes('?') ||
        lower.startsWith('can you') ||
        lower.startsWith('could you') ||
        lower.startsWith('would you') ||
        lower.includes('please') ||
        lower.includes('action item');

      if (!(isQuestionLike || mentionsName)) return;

      const contextWindow = liveTranscript.slice(-4).map((s) => s.text).join(' ');
      const context = contextWindow.length > 400
        ? contextWindow.slice(contextWindow.length - 400)
        : contextWindow;

      setCalloutTimeline((prev) => {
        const next: LiveCalloutEntry[] = [
          ...prev,
          {
            id: segment.id,
            type: isQuestionLike ? 'question' : 'mention',
            text,
            context,
            source: segment.source,
            timestampMs: segment.timestamp,
          },
        ];
        return next.slice(-25);
      });
    });
  }, [liveTranscript, isRecording, isPaused, userFirstName]);

  // Hook into meeting notes completion event
  React.useEffect(() => {
    const unsubscribe = window.kakarot.recording.onNotesComplete?.((data: { meetingId: string; title: string; overview: string }) => {
      console.log('[RecordingView] Notes completed:', data);
      // Fetch the full meeting and display inline
      window.kakarot.meetings.get(data.meetingId)
        .then((meeting) => {
          if (meeting) {
            const hasNotes = Boolean((meeting as any).notesMarkdown || (meeting as any).overview);
            if (hasNotes) {
              setLastCompletedNoteId(data.meetingId);
              setCompletedMeeting(meeting);
              setPhase('completed');
              console.log('[RecordingView] Notes generated and displayed inline:', data.meetingId);
            } else {
              setPhase('error');
              setErrorMessage('Notes generation failed. You can still view the transcript.');
              console.warn('[RecordingView] Notes generation appears to have failed.');
            }
          }
        })
        .catch((err) => {
          setPhase('error');
          setErrorMessage('Something went wrong loading your meeting.');
          console.error('[RecordingView] Failed to load meeting after notes completion:', err);
        });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [setLastCompletedNoteId]);

  // Hook into native notification click event for starting recording
  React.useEffect(() => {
    console.log('[RecordingView] Setting up notification listener');
    const unsubscribe = window.kakarot.recording.onNotificationStartRecording?.((context) => {
      console.log('[RecordingView] Notification triggered recording start with context:', context);
      // Convert notification context to CalendarEvent format
      const calendarEvent: CalendarEvent = {
        id: context.calendarEventId,
        title: context.calendarEventTitle,
        attendees: context.calendarEventAttendees || [],
        start: new Date(context.calendarEventStart),
        end: new Date(context.calendarEventEnd),
        location: '', // Will be set from the meeting link
        provider: context.calendarProvider as 'google' | 'outlook' | 'icloud',
      };
      console.log('[RecordingView] Calling handleStartRecording with:', calendarEvent);
      // Start recording with the calendar event context from the notification
      handleStartRecording(calendarEvent);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good Morning, ${userFirstName}`;
    if (hour < 18) return `Good Afternoon, ${userFirstName}`;
    return `Good Evening, ${userFirstName}`;
  };

  const handleStartRecording = async (calendarEvent?: CalendarEvent) => {
    console.log('[RecordingView] Start button clicked');
    
    // If an event is explicitly passed, use it and set as active calendar context
    // If no event is passed (manual recording), clear any existing calendar context
    if (calendarEvent) {
      console.log('[RecordingView] Setting active calendar context from event:', calendarEvent.title);
      setActiveCalendarContext(calendarEvent);
      setShowManualNotes(true); // Show manual notes when recording from calendar context
    } else {
      console.log('[RecordingView] Manual recording - clearing active calendar context');
      setActiveCalendarContext(null);
      setShowManualNotes(false);
    }
    
    // Use only the passed event, not any previously stored context
    const contextToUse = calendarEvent || null;
    console.log('[RecordingView] Active calendar context:', contextToUse);
    
    clearLiveTranscript();
    setPhase('recording');
    setCompletedMeeting(null);
    setErrorMessage('');
    
    // Determine the title: prefer calendar context, fallback to "New Meeting"
    const titleToUse = contextToUse?.title || 'New Meeting';
    console.log('[RecordingView] Title to use:', titleToUse, 'from calendar:', !!contextToUse);
    setRecordingTitle(titleToUse);
    
    try {
      console.log('[RecordingView] Calling recording.start()...');
      // Pass active calendar context if available
      const calendarContextData = contextToUse ? {
        calendarEventId: contextToUse.id,
        calendarEventTitle: contextToUse.title,
        calendarEventAttendees: contextToUse.attendees,
        calendarEventStart: contextToUse.start.toISOString(),
        calendarEventEnd: contextToUse.end.toISOString(),
        calendarProvider: contextToUse.provider,
      } : undefined;
      
      console.log('[RecordingView] Calendar context being sent:', calendarContextData);
      const meetingId = await window.kakarot.recording.start(calendarContextData);
      setCurrentMeetingId(meetingId);
      console.log('[RecordingView] recording.start() completed, calling startCapture()...');
      await startCapture();
      console.log('[RecordingView] startCapture() completed');
      setPhase('recording');
      
      // Clear the preview modal now that recording has started
      setCalendarContext(null);
      // Keep activeCalendarContext for the entire recording session
    } catch (error) {
      console.error('[RecordingView] Error starting recording:', error);
    }
  };

  const handleStopRecording = async () => {
    setPhase('processing');
    setErrorMessage('');
    await stopCapture();
    const meeting = await window.kakarot.recording.stop();
    console.log('Meeting ended:', meeting);
    
    // If there was a calendar context for this recording, link the notes back
    if (activeCalendarContext && meeting) {
      try {
        const provider = activeCalendarContext.provider as 'google' | 'outlook' | 'icloud';
        await window.kakarot.calendar.linkNotes(
          activeCalendarContext.id,
          meeting.id,
          provider
        );
        console.log('Notes linked to calendar event:', {
          eventId: activeCalendarContext.id,
          notesId: meeting.id,
        });
      } catch (err) {
        console.error('Failed to link notes to calendar event:', err);
        // Don't fail the recording, this is optional
      }
    }
    
    // Check CRM settings and trigger prompt if needed
    try {
      const settings = await window.kakarot.settings.get() as AppSettings;
      if (settings.crmNotesBehavior === 'ask' && settings.crmConnections) {
        // Find first connected CRM provider
        const connectedProvider = (Object.keys(settings.crmConnections) as Array<'salesforce' | 'hubspot'>).find(
          (provider) => settings.crmConnections?.[provider]?.accessToken
        );
        
        if (connectedProvider && meeting) {
          setPendingCRMMeetingId(meeting.id);
          setCRMProvider(connectedProvider);
          setShowCRMPrompt(true);
        }
      }
    } catch (err) {
      console.error('[RecordingView] Failed to check CRM settings:', err);
    }
    
    // Keep active calendar context until notes render so metadata can be surfaced
  };

  const isMeetingNotesScreen = phase === 'completed' && Boolean(completedMeeting);
  const showBentoWhileLive = showRecordingHome && (isRecording || isPaused || isGenerating);
  const showHomeHero = (isIdle || showBentoWhileLive) && !isMeetingNotesScreen;

  // Display title: use recordingTitle which is set from calendar context or timestamp at start
  // For completed meetings, prefer the stored title which should be calendar title if it existed
  const displayTitle = (phase === 'completed' && completedMeeting) 
    ? completedMeeting.title 
    : recordingTitle;
  const displayDate = activeCalendarContext?.start || (completedMeeting ? new Date(completedMeeting.createdAt) : new Date());
  const displayAttendees: string[] = (
    activeCalendarContext?.attendees?.map((a: any) => 
      typeof a === 'string' ? a : a.email
    ) || completedMeeting?.attendeeEmails || completedMeeting?.participants || []
  );
  const displayLocation = activeCalendarContext?.location;

  React.useEffect(() => {
    setTitleInput(displayTitle || '');
  }, [displayTitle]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(event.target as Node)) {
        setShowSharePopover(false);
      }
      if (
        timePopoverRef.current && !timePopoverRef.current.contains(event.target as Node) &&
        timeButtonRef.current && !timeButtonRef.current.contains(event.target as Node)
      ) {
        setShowTimePopover(false);
      }
      if (
        participantsPopoverRef.current && !participantsPopoverRef.current.contains(event.target as Node) &&
        participantsButtonRef.current && !participantsButtonRef.current.contains(event.target as Node)
      ) {
        setShowParticipantsPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const persistTitle = async (nextTitleRaw: string) => {
    const nextTitle = nextTitleRaw.trim() || 'Untitled Meeting';
    setTitleInput(nextTitle);
    setRecordingTitle(nextTitle);
    setCompletedMeeting((prev: any) => (prev ? { ...prev, title: nextTitle } : prev));

    const targetMeetingId = completedMeeting?.id || currentMeetingId || upcomingMeetingId;
    if (!targetMeetingId) return;

    setIsSavingTitle(true);
    try {
      await window.kakarot.meetings.updateTitle(targetMeetingId, nextTitle);
    } catch (err) {
      console.error('Failed to update meeting title', err);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const shareLink = completedMeeting ? `kakarot://meeting/${completedMeeting.id}` : '';

  const handleCopyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy share link', err);
    }
  };

  const handleCRMPromptYes = async () => {
    if (!pendingCRMMeetingId) return;
    
    setIsPushingNotes(true);
    try {
      await window.kakarot.crm.pushNotes(pendingCRMMeetingId);
      console.log('[RecordingView] Notes pushed to CRM successfully');
    } catch (err) {
      console.error('[RecordingView] Failed to push notes to CRM:', err);
    } finally {
      setShowCRMPrompt(false);
      setPendingCRMMeetingId(null);
      setCRMProvider(null);
      setIsPushingNotes(false);
    }
  };

  const handleCRMPromptNo = () => {
    setShowCRMPrompt(false);
    setPendingCRMMeetingId(null);
    setCRMProvider(null);
  };

  return (
    <>
    {/* Show Manual Notes View if viewing notes tab while idle and have calendar context */}
    {isIdle && pillarTab === 'notes' && (activeCalendarContext || calendarContext) ? (
      <ManualNotesView 
        meetingId={upcomingMeetingId || undefined} 
        onSelectTab={handleSelectTab}
        onSaveNotes={() => {
          // After notes are saved, go back to home view
          setPillarTab('notes');
          setActiveCalendarContext(null);
        }}
        onStartRecording={() => {
          // Start recording from manual notes view
          const calEvent = activeCalendarContext || calendarContext;
          if (calEvent) {
            handleStartRecording(calEvent);
          }
        }}
      />
    ) : (
    <div className="flex-1 min-h-0 bg-gradient-to-br from-[#0C0C0F] via-[#0D0D0F] to-[#0C0C14] text-slate-ink dark:text-gray-100 flex flex-col overflow-hidden">
      {/* Meeting Context Preview Modal */}
      {calendarContext && isIdle && (
        <MeetingContextPreview
          meeting={calendarContext}
          onDismiss={() => setCalendarContext(null)}
        />
      )}

      <div className="w-full py-4 flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Greeting + Unified Action Row - Only show when truly idle (not viewing completed notes) */}
        {showHomeHero && (
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 space-y-3">
            {/* Greeting */}
            <div>
              <h1 className="text-3xl font-medium text-slate-900 dark:text-white">
                {getGreeting()}
              </h1>
            </div>

            {/* Unified Action Row (Search + Take Notes) */}
            <div className="flex items-center gap-2">
              {/* Search Bar - 75% width */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search meetings or notes"
                  className="w-full pl-10 pr-4 py-1.5 bg-white/70 dark:bg-graphite/80 border border-white/30 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/50 backdrop-blur-md transition cursor-pointer"
                  onClick={() => setShowSearchPopup(true)}
                  onFocus={() => setShowSearchPopup(true)}
                  readOnly
                />
              </div>

              {/* Take Notes Button - 25% width, compact size */}
              <button
                onClick={() => handleStartRecording()}
                disabled={isRecording || isPaused || isGenerating}
                className="px-3 py-1.5 bg-[#8B5CF6] text-white font-semibold rounded-lg flex items-center gap-1 shadow-soft-card transition hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0 text-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                + Take Notes
              </button>
            </div>
          </div>
        )}

        {/* Recording controls and titles - Show when recording, paused, or generating notes */}
        {!isIdle && !showBentoWhileLive && (
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 space-y-3">
            {/* Recording Status with Visual Indicator */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {isRecording && (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                )}
                {isPaused && (
                  <span className="inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                )}
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {isRecording && 'Recording in progress'}
                  {isPaused && 'Recording paused'}
                </p>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {isRecording && 'Keep the conversation flowing — your notes are being captured'}
                {isPaused && 'Resume when ready to continue capturing'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={() => persistTitle(titleInput)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  className="text-lg font-semibold text-slate-900 dark:text-white bg-transparent border-b border-transparent focus:border-[#8B5CF6] focus:outline-none truncate"
                  placeholder="Untitled Meeting"
                />
                {isSavingTitle && <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" />}
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-3 text-sm flex-wrap relative">
                {/* Time Button */}
                <div className="relative">
                  <button
                    ref={timeButtonRef}
                    onClick={() => setShowTimePopover(!showTimePopover)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:bg-white/80 dark:hover:bg-slate-700/80 transition text-slate-600 dark:text-slate-400"
                  >
                    <Clock className="w-4 h-4" />
                    <span>{displayDate.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <ChevronDown className="w-4 h-4 opacity-50" />
                  </button>

                  {showTimePopover && (
                    <div
                      ref={timePopoverRef}
                      className="absolute top-full left-0 mt-2 bg-slate-900 dark:bg-slate-950 rounded-xl border border-slate-800 dark:border-slate-700 shadow-2xl z-50 overflow-hidden min-w-max"
                    >
                      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-white">Meeting Time</h3>
                        <button
                          onClick={() => setShowTimePopover(false)}
                          className="p-1 text-slate-400 hover:text-slate-200 transition rounded hover:bg-slate-800/50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <p className="text-xs text-slate-400 uppercase font-medium mb-1">Date</p>
                          <p className="text-sm text-white font-medium">{displayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 uppercase font-medium mb-1">Time</p>
                          <p className="text-sm text-white font-medium">{displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Participants Button - only show for calendar event meetings */}
                {activeCalendarContext && (
                  <div className="relative">
                    <button
                      ref={participantsButtonRef}
                      onClick={() => setShowParticipantsPopover(!showParticipantsPopover)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:bg-white/80 dark:hover:bg-slate-700/80 transition text-slate-600 dark:text-slate-400"
                    >
                      <Users className="w-4 h-4" />
                      <span>{displayAttendees && displayAttendees.length > 0 ? displayAttendees.length : '0'} Participant{(displayAttendees?.length || 0) !== 1 ? 's' : ''}</span>
                      <ChevronDown className="w-4 h-4 opacity-50" />
                    </button>

                    {showParticipantsPopover && (
                      <div
                        ref={participantsPopoverRef}
                        className="absolute top-full left-0 mt-2 bg-slate-900 dark:bg-slate-950 rounded-xl border border-slate-800 dark:border-slate-700 shadow-2xl z-50 overflow-hidden min-w-[320px]"
                      >
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                          <h3 className="text-base font-semibold text-white">Participants</h3>
                          <button
                            onClick={() => setShowParticipantsPopover(false)}
                            className="p-1 text-slate-400 hover:text-slate-200 transition rounded hover:bg-slate-800/50"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="p-4">
                          {displayAttendees && displayAttendees.length > 0 ? (
                            <div className="space-y-2">
                              {displayAttendees.map((email, idx) => (
                                <div key={idx} className="flex items-center gap-3 text-sm">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                                    {email.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-slate-200 truncate">{email}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-slate-400 text-sm">No participants added</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Recording Control Buttons */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/20 dark:border-white/10 bg-transparent backdrop-blur-sm">
              <button
                onClick={handleStopRecording}
                disabled={isGenerating}
                className={`px-3 py-2 rounded-lg bg-red-500/90 text-white text-sm font-medium flex items-center gap-2 transition ${isGenerating ? 'opacity-60 cursor-not-allowed' : 'hover:bg-red-600'}`}
              >
                <Square className="w-4 h-4" />
                Stop recording
              </button>
            </div>
          </div>
        )}

        {/* Compact audio meters moved into transcript header */}

        {/* Dashboard or meeting content; transcript now lives in floating pill popover */}
        <div className="w-full flex justify-center flex-1 min-h-0 h-full overflow-hidden">
          <div className="w-full max-w-2xl h-full overflow-hidden flex flex-col min-h-0 px-4 sm:px-6">
            {showBentoWhileLive ? (
              <div className="h-full flex flex-col overflow-hidden">
                {/* Amber banner with back button */}
                <div className="flex-shrink-0 pt-4 sm:pt-6 pb-2">
                  <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200/60 dark:border-amber-500/40 bg-amber-50/70 dark:bg-amber-900/30 text-amber-800 dark:text-amber-100">
                    <div className="text-sm font-medium">{recordingTitle || 'Meeting'} - Transcription in Progress</div>
                    <button
                      className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                      onClick={() => setShowRecordingHome(false)}
                    >
                      Back to the meeting
                    </button>
                  </div>
                </div>
                {/* BentoDashboard below the banner */}
                <div className="flex-1 min-h-0 overflow-auto pb-4 sm:pb-6">
                  <BentoDashboard isRecording={isRecording || isPaused} hideCompactBarWhenNoEvents={true} onStartNotes={handleStartRecording} onSelectTab={handleSelectTab} />
                </div>
              </div>
            ) : isRecording || isPaused || isGenerating || phase === 'completed' || phase === 'error' ? (
              <div className="h-full flex flex-col">
                {showManualNotes && (isRecording || isPaused) && !isGenerating ? (
                  <div className="h-full flex flex-col p-6 flex-1 min-h-0 gap-4 overflow-hidden">
                    <LiveCalloutTracker
                      entries={calloutTimeline}
                      onClear={() => setCalloutTimeline([])}
                    />
                    <div className="flex items-center justify-between flex-shrink-0">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Your Notes</h3>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <div className="h-full flex flex-col border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Your prep notes..."
                          className="w-full h-full flex-1 min-h-0 resize-none bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none leading-relaxed px-4 py-3 overflow-auto"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col flex-1 min-h-0 gap-4 p-4 sm:p-6">
                    <div className="mb-4 flex items-center justify-between flex-shrink-0">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                          {phase === 'completed' ? 'Meeting Notes' : 'Recording'}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {phase === 'completed' ? 'Generated from your meeting' : 'Transcript is available in the floating pill below.'}
                        </p>
                      </div>
                      {phase === 'completed' && completedMeeting ? (
                        <div className="relative" ref={shareRef}>
                          <button
                            onClick={() => setShowSharePopover((prev) => !prev)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/30 dark:border-white/10 bg-white/70 dark:bg-slate-800/70 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-slate-700/90 transition"
                          >
                            <Share2 className="w-4 h-4" />
                            Share
                          </button>
                          {showSharePopover && (
                            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-soft-card p-3 space-y-2">
                              <p className="text-xs text-slate-500 dark:text-slate-400">Share your meeting notes</p>
                              <button
                                onClick={handleCopyShareLink}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-700 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                              >
                                <span className="flex items-center gap-2">
                                  {shareCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                  {shareCopied ? 'Copied!' : 'Copy share link'}
                                </span>
                                <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Link</span>
                              </button>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 break-all leading-tight bg-slate-50 dark:bg-slate-900/60 rounded-md px-2 py-1">{shareLink}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        (isRecording || isPaused) && (
                          <div className="flex items-center gap-3">
                            <div className="w-40">
                              <AudioLevelMeter label="Mic" level={audioLevels.mic} />
                            </div>
                            <div className="w-40">
                              <AudioLevelMeter label="System" level={audioLevels.system} />
                            </div>
                          </div>
                        )
                      )}
                    </div>
                    {isGenerating ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                          <Loader2 className="w-10 h-10 animate-spin mx-auto text-[#8B5CF6]" />
                          <p className="mt-3 text-base font-medium text-slate-900 dark:text-white">Generating Notes…</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">This usually takes a few seconds.</p>
                        </div>
                      </div>
                    ) : phase === 'completed' && completedMeeting ? (
                      <div className="flex-1 overflow-y-auto pb-32 space-y-6">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <input
                              value={titleInput}
                              onChange={(e) => setTitleInput(e.target.value)}
                              onBlur={() => persistTitle(titleInput)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                }
                              }}
                              className="flex-1 text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-tight bg-transparent border-b border-transparent focus:border-[#8B5CF6] focus:outline-none"
                              placeholder="Untitled Meeting"
                            />
                            {isSavingTitle && <Loader2 className="w-5 h-5 animate-spin text-[#8B5CF6]" />}
                          </div>

                          <div className="flex gap-3 overflow-visible">
                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 px-3 py-1.5">
                              <CalendarIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                              <div className="text-sm text-slate-800 dark:text-slate-200">{formatDateTime(displayDate)}</div>
                            </div>

                            {displayAttendees && displayAttendees.length > 0 ? (
                              <div className="overflow-visible">
                                <AttendeesList attendeeEmails={displayAttendees} />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 px-3 py-1.5">
                                <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                                <div className="text-sm text-slate-800 dark:text-slate-200">Add attendees</div>
                              </div>
                            )}

                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 px-3 py-1.5">
                              <Folder className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                              <div className="text-sm text-slate-800 dark:text-slate-200">{displayLocation || 'No folder'}</div>
                            </div>
                          </div>
                        </div>

                        {completedMeeting.overview && (
                          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-5 border border-slate-200 dark:border-slate-800">
                            <p className="text-base leading-relaxed text-slate-800 dark:text-slate-100">{completedMeeting.overview}</p>
                          </div>
                        )}

                        {completedMeeting.notesMarkdown && (
                          <div className="prose prose-sm max-w-none dark:prose-invert text-slate-800 dark:text-slate-200">
                            <div dangerouslySetInnerHTML={{ __html: (completedMeeting.notesMarkdown as string).replace(/\n/g, '<br/>') }} />
                          </div>
                        )}

                        {liveTranscript.length > 0 && (
                          <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Transcript</h3>
                            <div className="space-y-3">
                              {liveTranscript.map((segment) => (
                                <div key={segment.id} className={`flex ${segment.source === 'mic' ? 'justify-end' : 'justify-start'}`}>
                                  <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                                      segment.source === 'mic'
                                        ? 'bg-slate-900 dark:bg-slate-700 text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                                    }`}
                                  >
                                    <p>{segment.text}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col">
                        <div className="flex-1 min-h-0 rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/5 dark:bg-slate-900/20 px-4 py-3">
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Your prep notes..."
                            className="w-full h-full resize-none bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none leading-relaxed"
                          />
                        </div>
                      </div>
                    )}

                    {phase === 'error' && (
                      <div className="mt-3 rounded-lg border border-red-300/40 bg-red-50/20 text-red-600 dark:text-red-400 px-3 py-2 text-sm">
                        {errorMessage || 'Notes generation failed.'}
                        <div className="mt-2">
                          <button
                            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-gray-100 rounded-md text-xs"
                            onClick={async () => {
                              try {
                                const meetingsList = await window.kakarot.meetings.list();
                                const last = meetingsList[0];
                                if (last) {
                                  const full = await window.kakarot.meetings.get(last.id);
                                  setSelectedMeeting(full);
                                  setView('history');
                                }
                              } catch (e) {
                                console.error('Failed to navigate to transcript after error', e);
                              }
                            }}
                          >
                            View Transcript
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <BentoDashboard isRecording={isRecording || isPaused} onStartNotes={handleStartRecording} onSelectTab={handleSelectTab} />
            )}
          </div>

        </div>
      </div>

      {/* Floating transcript pill + popover */}
      {(isRecording || isPaused) && !isGenerating && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => setShowTranscriptPopover((open) => !open)}
            className="flex items-center gap-2 rounded-full px-4 py-2 bg-slate-900 text-white shadow-lg shadow-slate-900/30 hover:shadow-slate-900/40 transition dark:bg-slate-800"
            aria-label="Toggle live transcript"
          >
            <ScrollText className="w-4 h-4" />
            <span className="text-sm font-medium">Live Transcript</span>
          </button>
          {showTranscriptPopover && (
            <div className="mt-3 w-[380px] max-h-[420px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-md overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Live Transcript</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Auto-scroll while recording.</p>
                </div>
                <button
                  onClick={() => setShowTranscriptPopover(false)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700/80 transition"
                  aria-label="Close transcript"
                >
                  <X className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
              </div>
              <div className="h-[340px] overflow-y-auto px-4 pb-4 pt-3">
                <LiveTranscript segments={liveTranscript} currentPartials={currentPartials} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* "Ask your notes" bar - only in completed phase */}
      {phase === 'completed' && completedMeeting && (
        <AskNotesBar meeting={completedMeeting} onResponse={setAiResponse} />
      )}
      {/* AI Response Panel - render above ask bar if response exists */}
      {aiResponse && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-19 max-w-2xl w-full max-h-[300px] overflow-y-auto pointer-events-auto">
          <div className="mx-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-soft-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                  {aiResponse}
                </p>
              </div>
              <button
                onClick={() => setAiResponse('')}
                className="flex-shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CRM Meeting Complete Prompt Modal */}
      {showCRMPrompt && crmProvider && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-sm w-full border border-slate-200 dark:border-slate-700">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Send to {crmProvider === 'salesforce' ? 'Salesforce' : 'HubSpot'}?
                </h3>
                <button
                  onClick={handleCRMPromptNo}
                  disabled={isPushingNotes}
                  className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                Would you like to send these meeting notes to {crmProvider === 'salesforce' ? 'Salesforce' : 'HubSpot'}? 
                {crmProvider === 'salesforce' ? ' Notes will be added as tasks.' : ' Notes will be created as contact notes.'}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleCRMPromptNo}
                  disabled={isPushingNotes}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-50 transition"
                >
                  No
                </button>
                <button
                  onClick={handleCRMPromptYes}
                  disabled={isPushingNotes}
                  className="flex-1 px-4 py-2 rounded-lg bg-[#8B5CF6] text-white font-medium hover:bg-[#7C3AED] disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {isPushingNotes && <Loader2 className="w-4 h-4 animate-spin" />}
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    )}

    {/* Search Popup */}
    <SearchPopup
      isOpen={showSearchPopup}
      onClose={() => setShowSearchPopup(false)}
    />
    </>
  );
}

function LiveCalloutTracker({ entries, onClear }: { entries: LiveCalloutEntry[]; onClear: () => void }) {
  const formatRelativeTime = (timestampMs: number) => {
    const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40 backdrop-blur p-4 shadow-soft-card flex flex-col gap-3 min-h-[120px] max-h-56">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <MessageSquare className="w-4 h-4 text-[#8B5CF6]" />
          <span>Live Callout Tracker</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Clock3 className="w-3.5 h-3.5" />
          <span>Watching transcript</span>
          {entries.length > 0 && (
            <button
              onClick={onClear}
              className="ml-2 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Listening for questions or mentions...</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="border border-slate-200/70 dark:border-slate-700/70 rounded-lg bg-white/70 dark:bg-slate-800/70 p-3"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span className="uppercase tracking-wide font-semibold text-[11px] text-[#8B5CF6]">
                  {entry.type === 'question' ? 'Question' : 'Mention'}
                </span>
                <span>{formatRelativeTime(entry.timestampMs)}</span>
              </div>
              <p className="text-sm text-slate-900 dark:text-white leading-snug">{entry.text}</p>
              {entry.context && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Context: </span>
                  {entry.context}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { useAppStore } from '../stores/appStore';
import { useAudioCapture } from '../hooks/useAudioCapture';
import ActiveRecordingView from './ActiveRecordingView';
import ProcessingView from './ProcessingView';
import CRMPromptModal from './CRMPromptModal';
import type { CalendarEvent, AppSettings } from '@shared/types';
import { toast } from '../stores/toastStore';

interface RecordingViewProps {
  onSelectTab?: (tab: 'notes' | 'prep') => void;
}

export default function RecordingView({ onSelectTab: _onSelectTab }: RecordingViewProps) {
  const {
    recordingState,
    clearLiveTranscript,
    calendarPreview,
    setCalendarPreview,
    recordingContext,
    setRecordingContext,
    setLastCompletedNoteId,
    setSelectedMeeting,
    navigate,
    currentMeetingId,
    setCurrentMeetingId,
  } = useAppStore();

  const { startCapture, stopCapture, pause: pauseCapture, resume: resumeCapture } = useAudioCapture();

  const [upcomingMeetingId, setUpcomingMeetingId] = React.useState<string | null>(null);
  type MeetingPhase = 'idle' | 'recording' | 'processing';
  const [phase, setPhase] = React.useState<MeetingPhase>(recordingState === 'recording' || recordingState === 'paused' ? 'recording' : 'idle');
  const [titleInput, setTitleInput] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [isSavingTitle, setIsSavingTitle] = React.useState(false);
  const [showCRMPrompt, setShowCRMPrompt] = React.useState(false);
  const [pendingCRMMeetingId, setPendingCRMMeetingId] = React.useState<string | null>(null);
  const [crmProvider, setCRMProvider] = React.useState<'salesforce' | 'hubspot' | null>(null);
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const isIdle = recordingState === 'idle';
  const isRecording = recordingState === 'recording';
  const isPaused = recordingState === 'paused';

  // Start audio capture if recording was initiated before mount (e.g., from HomeView)
  const didStartCaptureRef = React.useRef(false);
  React.useEffect(() => {
    if (isRecording && !didStartCaptureRef.current) {
      didStartCaptureRef.current = true;
      setPhase('recording');
      startCapture().catch(console.error);
    }
  }, [isRecording, startCapture]);

  // Ensure title reflects calendar context when recording starts outside this view
  React.useEffect(() => {
    if (!recordingContext?.title) return;
    setTitleInput((prev) => {
      const trimmed = prev.trim();
      return trimmed ? prev : recordingContext.title;
    });
  }, [recordingContext]);

  // Track previous recording state
  const prevRecordingStateRef = React.useRef<string>(recordingState);

  // Pause/resume/stop audio capture on state changes
  React.useEffect(() => {
    const prevState = prevRecordingStateRef.current;
    prevRecordingStateRef.current = recordingState;

    if (recordingState === 'paused') {
      pauseCapture();
    } else if (recordingState === 'recording' && prevState === 'paused') {
      resumeCapture();
    } else if (recordingState === 'idle' && prevState !== 'idle') {
      stopCapture();
    }
  }, [recordingState, pauseCapture, resumeCapture, stopCapture]);

  // Initialize meeting for upcoming calendar event manual notes
  React.useEffect(() => {
    if (isIdle && calendarPreview && !recordingContext && !upcomingMeetingId) {
      const meeting = calendarPreview;
      window.kakarot.settings.get()
        .then((settings) => {
          const mappings = (settings as AppSettings).calendarEventMappings || {};
          const existing = mappings[meeting.id];
          if (existing?.notesId) {
            setUpcomingMeetingId(existing.notesId);
            return null;
          }
          const attendeeEmails = meeting.attendees?.map((a: any) => typeof a === 'string' ? a : a.email) || [];
          return window.kakarot.meetings.createDismissed(meeting.title, attendeeEmails)
            .then(async (meetingId: string) => {
              setUpcomingMeetingId(meetingId);
              try {
                await window.kakarot.calendar.linkNotes(meeting.id, meetingId, meeting.provider as 'google' | 'outlook' | 'icloud');
              } catch (linkErr) {
                console.warn('[RecordingView] Failed to link notes:', linkErr);
              }
              return meetingId;
            });
        })
        .catch((err) => {
          console.error('[RecordingView] Failed initializing manual notes meeting:', err);
          toast.error('Failed to initialize meeting notes');
        });
    }
  }, [isIdle, recordingContext, calendarPreview, upcomingMeetingId]);

  // Autosave notes during recording
  React.useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (notes.trim() && (currentMeetingId || upcomingMeetingId)) {
      const id = currentMeetingId || upcomingMeetingId;
      saveTimerRef.current = setTimeout(async () => {
        try {
          await window.kakarot.meetings.saveManualNotes(id!, notes);
        } catch (error) {
          console.error('Failed to autosave notes:', error);
        }
      }, 1000);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [notes, currentMeetingId, upcomingMeetingId]);

  // Notes completion handler
  React.useEffect(() => {
    const unsubscribe = window.kakarot.recording.onNotesComplete?.((data: { meetingId: string; title: string; overview: string }) => {
      console.log('[RecordingView] Notes completed:', data);
      window.kakarot.meetings.get(data.meetingId)
        .then((meeting) => {
          if (meeting) {
            const hasNotes = Boolean((meeting as any).notes || (meeting as any).notesMarkdown || (meeting as any).overview);
            if (hasNotes) {
              setLastCompletedNoteId(data.meetingId);
              setSelectedMeeting(meeting);
              navigate('meeting-detail', { meetingId: data.meetingId, replace: true });
            } else {
              setSelectedMeeting(meeting);
              navigate('meeting-detail', { meetingId: data.meetingId, replace: true });
              setRecordingContext(null);
            }
          }
        })
        .catch((err) => {
          console.error('[RecordingView] Failed to load meeting after notes completion:', err);
          setRecordingContext(null);
          toast.error('Failed to load completed meeting');
        });

      // Check CRM settings
      window.kakarot.settings.get()
        .then((settings) => {
          const s = settings as AppSettings;
          if (s.crmConnections) {
            const connectedProvider = (Object.keys(s.crmConnections) as Array<'salesforce' | 'hubspot'>).find(
              (provider) => s.crmConnections?.[provider]?.accessToken
            );
            if (connectedProvider) {
              if (s.crmNotesBehavior === 'always') {
                window.kakarot.crm.pushNotes(data.meetingId).catch((err) => {
                  console.error('[RecordingView] CRM push failed:', err);
                  toast.error('Failed to push notes to CRM');
                });
              } else if (s.crmNotesBehavior === 'ask') {
                setPendingCRMMeetingId(data.meetingId);
                setCRMProvider(connectedProvider);
                setShowCRMPrompt(true);
              }
            }
          }
        })
        .catch(console.error);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [setLastCompletedNoteId, navigate, setSelectedMeeting, setRecordingContext]);

  // Auto-stop handler
  React.useEffect(() => {
    const unsubscribe = window.kakarot.recording.onAutoStop?.(() => {
      console.log('[RecordingView] Auto stop triggered');
      setPhase('processing');
      stopCapture().catch(console.warn);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [stopCapture]);

  // Notification start recording handler
  React.useEffect(() => {
    const unsubscribe = window.kakarot.recording.onNotificationStartRecording?.((context) => {
      const calendarEvent: CalendarEvent = {
        id: context.calendarEventId,
        title: context.calendarEventTitle,
        attendees: context.calendarEventAttendees || [],
        start: new Date(context.calendarEventStart),
        end: new Date(context.calendarEventEnd),
        location: '',
        provider: context.calendarProvider as 'google' | 'outlook' | 'icloud',
      };
      handleStartRecording(calendarEvent);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // --- Recording lifecycle handlers ---

  const handleStartRecording = async (calendarEvent?: CalendarEvent) => {
    if (calendarEvent) {
      setRecordingContext(calendarEvent);
    } else {
      setRecordingContext(null);
    }

    const contextToUse = calendarEvent || null;
    clearLiveTranscript();
    setPhase('recording');
    setNotes('');

    const titleToUse = contextToUse?.title || 'New Meeting';

    setTitleInput(titleToUse);

    try {
      const calendarContextData = contextToUse ? {
        calendarEventId: contextToUse.id,
        calendarEventTitle: contextToUse.title,
        calendarEventAttendees: contextToUse.attendees,
        calendarEventStart: contextToUse.start.toISOString(),
        calendarEventEnd: contextToUse.end.toISOString(),
        calendarProvider: contextToUse.provider,
      } : undefined;

      const meetingId = await window.kakarot.recording.start(calendarContextData);
      setCurrentMeetingId(meetingId);
      startCapture().catch((error) => {
        console.error('[RecordingView] Error starting mic capture:', error);
        toast.error('Failed to start microphone capture');
      });
      setCalendarPreview(null);
      navigate('recording', { replace: true });
    } catch (error) {
      console.error('[RecordingView] Error starting recording:', error);
      setPhase('idle');
      toast.error('Failed to start recording');
    }
  };

  const handlePause = async () => {
    await window.kakarot.recording.pause();
  };

  const handleResume = async () => {
    await window.kakarot.recording.resume();
  };

  const handleStop = async () => {
    // Always stop, even if paused (resume first, then stop)
    if (recordingState === 'paused') {
      await window.kakarot.recording.resume();
    }
    setPhase('processing');
    await stopCapture();
    const meeting = await window.kakarot.recording.stop();

    // Link to calendar event if present
    if (recordingContext && meeting) {
      try {
        const provider = recordingContext.provider as 'google' | 'outlook' | 'icloud';
        await window.kakarot.calendar.linkNotes(recordingContext.id, meeting.id, provider);
      } catch (err) {
        console.error('Failed to link notes to calendar event:', err);
        toast.error('Failed to link notes to calendar event');
      }
    }
  };

  const handleDiscard = async () => {
    await window.kakarot.recording.discard();
    setPhase('idle');
    clearLiveTranscript();
    setNotes('');
    navigate('home', { replace: true });
  };

  const persistTitle = async (nextTitleRaw: string) => {
    const nextTitle = nextTitleRaw.trim() || 'Untitled Meeting';
    setTitleInput(nextTitle);
    const targetMeetingId = currentMeetingId || upcomingMeetingId;
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

  // --- Render ---

  // Manual notes view for upcoming meetings (no recording)
  if (isIdle && calendarPreview && !recordingContext) {
    navigate('home', { replace: true });
    return null;
  }

  // Active recording
  if ((isRecording || isPaused) && phase !== 'processing') {
    return (
      <>
        <ActiveRecordingView
          titleInput={titleInput}
          onTitleChange={setTitleInput}
          onTitleBlur={() => persistTitle(titleInput)}
          isSavingTitle={isSavingTitle}
          notes={notes}
          onNotesChange={setNotes}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onDiscard={handleDiscard}
        />
        {showCRMPrompt && crmProvider && pendingCRMMeetingId && (
          <CRMPromptModal
            meetingId={pendingCRMMeetingId}
            provider={crmProvider}
            onConfirm={() => { setShowCRMPrompt(false); setPendingCRMMeetingId(null); setCRMProvider(null); }}
            onDismiss={() => { setShowCRMPrompt(false); setPendingCRMMeetingId(null); setCRMProvider(null); }}
          />
        )}
      </>
    );
  }

  // Processing
  if (phase === 'processing') {
    return (
      <>
        <ProcessingView />
        {showCRMPrompt && crmProvider && pendingCRMMeetingId && (
          <CRMPromptModal
            meetingId={pendingCRMMeetingId}
            provider={crmProvider}
            onConfirm={() => { setShowCRMPrompt(false); setPendingCRMMeetingId(null); setCRMProvider(null); }}
            onDismiss={() => { setShowCRMPrompt(false); setPendingCRMMeetingId(null); setCRMProvider(null); }}
          />
        )}
      </>
    );
  }

  // Fallback -- shouldn't reach here normally, navigate home
  return null;
}

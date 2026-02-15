import React from 'react';
import { useAppStore } from '../stores/appStore';
import { useAudioCapture } from '../hooks/useAudioCapture';
import ActiveRecordingView from './ActiveRecordingView';
import ProcessingView from './ProcessingView';
import CRMPromptModal from './CRMPromptModal';
import ManualNotesView from './ManualNotesView';
import MeetingContextPreview from './MeetingContextPreview';
import type { CalendarEvent, AppSettings } from '@shared/types';

interface RecordingViewProps {
  onSelectTab?: (tab: 'notes' | 'prep') => void;
}

export default function RecordingView({ onSelectTab }: RecordingViewProps) {
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
    setInitialPrepQuery,
  } = useAppStore();

  const { startCapture, stopCapture, pause: pauseCapture, resume: resumeCapture } = useAudioCapture();

  const [upcomingMeetingId, setUpcomingMeetingId] = React.useState<string | null>(null);
  type MeetingPhase = 'idle' | 'recording' | 'processing';
  const [phase, setPhase] = React.useState<MeetingPhase>('idle');
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
        .catch((err) => console.error('[RecordingView] Failed initializing manual notes meeting:', err));
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
                window.kakarot.crm.pushNotes(data.meetingId).catch(console.error);
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
      await startCapture();
      setCalendarPreview(null);
      navigate('recording', { replace: true });
    } catch (error) {
      console.error('[RecordingView] Error starting recording:', error);
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

  const handlePrepMeeting = async (meeting: CalendarEvent) => {
    const settings = await window.kakarot.settings.get() as AppSettings;
    const userEmail = settings.userProfile?.email?.toLowerCase();
    const attendeeNamesList = meeting.attendees
      ?.filter(a => {
        const email = (typeof a === 'string' ? a : a.email || '').toLowerCase();
        return email && email !== userEmail;
      })
      .map(a => typeof a === 'string' ? a : a.name || a.email)
      .filter(Boolean) ?? [];

    if (attendeeNamesList.length > 0) {
      setInitialPrepQuery(`I have a meeting with ${attendeeNamesList.join(', ')}, help me prep.`);
    } else {
      setInitialPrepQuery(null);
    }
    onSelectTab?.('prep');
  };

  // --- Render ---

  // Manual notes view for upcoming meetings (no recording)
  if (isIdle && calendarPreview && !recordingContext) {
    return (
      <>
        <ManualNotesView
          meetingId={upcomingMeetingId || undefined}
          onSelectTab={onSelectTab}
          onSaveNotes={() => {
            setRecordingContext(null);
            navigate('home', { replace: true });
          }}
          onStartRecording={() => {
            const calEvent = calendarPreview;
            if (calEvent) handleStartRecording(calEvent);
          }}
        />
        {calendarPreview && isIdle && (
          <MeetingContextPreview
            meeting={calendarPreview}
            onDismiss={() => setCalendarPreview(null)}
            onPrep={handlePrepMeeting}
            onTranscribeNow={(m) => handleStartRecording(m)}
          />
        )}
      </>
    );
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

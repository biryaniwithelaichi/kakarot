import { useState } from 'react';
import { useShallow } from 'zustand/shallow';
import type { CalendarEvent } from '@shared/types';
import { useAppStore } from '@renderer/stores/appStore';
import CompactMeetingBar from './CompactMeetingBar';
import UpcomingMeetingsList from './UpcomingMeetingsList';
import PreviousMeetingsList from './PreviousMeetingsList';
import UpcomingMeetingsPopup from '../UpcomingMeetingsPopup';
import MeetingContextPreview from '../MeetingContextPreview';
import { DashboardSkeleton } from '../Skeleton';

interface BentoDashboardProps {
  isRecording: boolean;
  hideCompactBarWhenNoEvents?: boolean;
  onStartNotes: (event?: CalendarEvent) => void;
  onSelectTab?: (tab: 'notes' | 'prep') => void;
}

export default function BentoDashboard({ isRecording, hideCompactBarWhenNoEvents, onStartNotes, onSelectTab }: BentoDashboardProps): JSX.Element {
  const [showUpcomingPopup, setShowUpcomingPopup] = useState(false);
  const [previewMeeting, setPreviewMeeting] = useState<CalendarEvent | null>(null);

  const {
    navigate,
    setSelectedMeeting,
    setCalendarPreview,
    setRecordingContext,
    liveCalendarEvents,
    upcomingCalendarEvents,
    previousMeetings,
    calendarMappings,
    addDismissedEventId,
    setPreviousMeetings,
    settings,
    setInitialPrepQuery,
    dashboardDataLoaded,
  } = useAppStore(useShallow((state) => ({
    navigate: state.navigate,
    setSelectedMeeting: state.setSelectedMeeting,
    setCalendarPreview: state.setCalendarPreview,
    setRecordingContext: state.setRecordingContext,
    liveCalendarEvents: state.liveCalendarEvents,
    upcomingCalendarEvents: state.upcomingCalendarEvents,
    previousMeetings: state.previousMeetings,
    calendarMappings: state.calendarMappings,
    addDismissedEventId: state.addDismissedEventId,
    setPreviousMeetings: state.setPreviousMeetings,
    settings: state.settings,
    setInitialPrepQuery: state.setInitialPrepQuery,
    dashboardDataLoaded: state.dashboardDataLoaded,
  })));

  const closePreview = () => setPreviewMeeting(null);

  const isCalendarConnected = !!(
    settings?.calendarConnections?.google ||
    settings?.calendarConnections?.outlook ||
    settings?.calendarConnections?.icloud
  );

  const handleViewNotes = async (meetingId: string) => {
    try {
      const meeting = await window.kakarot.meetings.get(meetingId);
      if (meeting) {
        setSelectedMeeting(meeting);
        navigate('meeting-detail', { meetingId });
      }
    } catch (err) {
      console.error('Failed to load meeting:', err);
    }
  };

  const handleViewCalendarEventNotes = async (calendarEventId: string) => {
    try {
      const mapping = calendarMappings[calendarEventId];
      if (mapping?.notesId) {
        await handleViewNotes(mapping.notesId);
      }
    } catch (err) {
      console.error('Failed to view calendar event notes:', err);
    }
  };

  const handleNavigateSettings = () => {
    navigate('settings');
  };

  const handleSelectUpcomingMeeting = (event: CalendarEvent) => {
    setPreviewMeeting(event);
  };

  const handlePrepMeeting = async (meeting: CalendarEvent) => {
    try {
      const settingsResp = await window.kakarot.settings.get();
      const userEmail = settingsResp?.userProfile?.email?.toLowerCase();
      const attendeeNamesList = meeting.attendees
        ?.filter((a: any) => {
          const email = (typeof a === 'string' ? a : a.email || '').toLowerCase();
          return email && email !== userEmail;
        })
        .map((a: any) => (typeof a === 'string' ? a : a.name || a.email))
        .filter(Boolean) ?? [];

      if (attendeeNamesList.length > 0) {
        setInitialPrepQuery(`I have a meeting with ${attendeeNamesList.join(', ')}, help me prep.`);
      } else {
        setInitialPrepQuery(null);
      }
      onSelectTab?.('prep');
      navigate('home');
    } catch (err) {
      console.error('Failed to prep meeting:', err);
    }
  };

  const handleTakeManualNotes = (event: CalendarEvent) => {
    setCalendarPreview(event);
    setRecordingContext(null);
    navigate('recording');
    onSelectTab?.('notes');
  };

  const handleDismissLiveMeeting = async (eventId: string) => {
    try {
      const event = liveCalendarEvents.find(e => e.id === eventId);
      if (!event) return;

      addDismissedEventId(eventId);

      await window.kakarot.meetings.createDismissed(
        event.title,
        event.attendees?.map((a: any) => typeof a === 'string' ? a : a.email)
      );

      const meetings = await window.kakarot.meetings.list();
      const now = Date.now();
      const completed = meetings
        .filter((m): m is typeof m & { endedAt: Date } => m.endedAt !== null)
        .filter((m) => new Date(m.endedAt).getTime() < now)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((m) => ({
          id: m.id,
          title: m.title,
          start: new Date(m.createdAt),
          end: new Date(m.endedAt),
          hasTranscript: m.transcript.length > 0,
          isCalendarEvent: false,
        }));
      setPreviousMeetings(completed);
    } catch (err) {
      console.error('Failed to dismiss live meeting:', err);
    }
  };

  if (!dashboardDataLoaded) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="h-full flex flex-col items-center overflow-auto px-2 py-4">
      <div className="w-full max-w-3xl flex flex-col gap-3">
        <CompactMeetingBar
          events={liveCalendarEvents}
          isRecording={isRecording}
          hideWhenNoEvents={hideCompactBarWhenNoEvents}
          onStartNotes={onStartNotes}
          onPrep={() => onSelectTab?.('prep')}
          onDismiss={handleDismissLiveMeeting}
        />

        <UpcomingMeetingsList
          meetings={upcomingCalendarEvents}
          isCalendarConnected={isCalendarConnected}
          onNavigateSettings={handleNavigateSettings}
          onSelectMeeting={handleSelectUpcomingMeeting}
          onTakeNotes={handleTakeManualNotes}
          onViewMore={() => setShowUpcomingPopup(true)}
        />

        {showUpcomingPopup && (
          <UpcomingMeetingsPopup
            meetings={upcomingCalendarEvents}
            onClose={() => setShowUpcomingPopup(false)}
            onSelectMeeting={(event) => {
              setShowUpcomingPopup(false);
              handleSelectUpcomingMeeting(event);
            }}
            onTakeNotes={handleTakeManualNotes}
          />
        )}

        {previewMeeting && (
          <MeetingContextPreview
            meeting={previewMeeting}
            onDismiss={closePreview}
            onPrep={(meeting) => {
              closePreview();
              handlePrepMeeting(meeting);
            }}
            onTranscribeNow={(meeting) => {
              closePreview();
              onStartNotes(meeting);
            }}
          />
        )}

        <PreviousMeetingsList
          meetings={previousMeetings}
          onViewNotes={handleViewNotes}
          onViewCalendarEventNotes={handleViewCalendarEventNotes}
          onViewMore={() => navigate('history')}
        />
      </div>
    </div>
  );
}

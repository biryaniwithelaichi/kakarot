import React, { useState } from 'react';
import type { CalendarEvent } from '@shared/types';
import { useAppStore } from '@renderer/stores/appStore';
import CompactMeetingBar from './CompactMeetingBar';
import UpcomingMeetingsList from './UpcomingMeetingsList';
import PreviousMeetingsList from './PreviousMeetingsList';
import UpcomingMeetingsPopup from '../UpcomingMeetingsPopup';

interface BentoDashboardProps {
  isRecording: boolean;
  hideCompactBarWhenNoEvents?: boolean;
  onStartNotes: (event?: CalendarEvent) => void;
  onSelectTab?: (tab: 'notes' | 'prep') => void;
}

export default function BentoDashboard({ isRecording, hideCompactBarWhenNoEvents, onStartNotes, onSelectTab }: BentoDashboardProps): JSX.Element {
  const [showUpcomingPopup, setShowUpcomingPopup] = useState(false);
  
  const {
    setView,
    setSelectedMeeting,
    setCalendarContext,
    setActiveCalendarContext,
    // Dashboard data from store (cached, loaded in App.tsx)
    liveCalendarEvents,
    upcomingCalendarEvents,
    previousMeetings,
    calendarMappings,
    addDismissedEventId,
    setPreviousMeetings,
    settings,
  } = useAppStore();

  // Check if any calendar is connected
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
        setView('history');
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
    setView('settings');
  };

  /**
   * Handle clicking on an upcoming meeting (Prep button)
   * Prepares to record with this calendar context
   */
  const handleSelectUpcomingMeeting = (event: CalendarEvent) => {
    const hasNotes = calendarMappings[event.id]?.notesId;

    if (hasNotes) {
      // View existing notes
      handleViewCalendarEventNotes(event.id);
    } else {
      // Prepare to record with this calendar context
      setCalendarContext(event);
      setActiveCalendarContext(event);
      setView('recording');
      onSelectTab?.('prep');
    }
  };

  /**
   * Handle taking manual notes on an upcoming meeting (Take Notes button)
   * Opens manual notes interface without audio recording
   */
  const handleTakeManualNotes = (event: CalendarEvent) => {
    setCalendarContext(event);
    setActiveCalendarContext(event);
    setView('recording');
    onSelectTab?.('notes');
  };

  const handleDismissLiveMeeting = async (eventId: string) => {
    try {
      const event = liveCalendarEvents.find(e => e.id === eventId);
      if (!event) return;

      // Add to dismissed IDs in store (this also updates localStorage)
      addDismissedEventId(eventId);

      // Create dismissed meeting record
      await window.kakarot.meetings.createDismissed(
        event.title,
        event.attendees?.map((a: any) => typeof a === 'string' ? a : a.email)
      );

      // Refresh previous meetings to show the dismissed meeting
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

  return (
    <div className="h-full flex flex-col items-center overflow-auto p-4">
      {/* Centered column container with max width */}
      <div className="w-full max-w-2xl flex flex-col gap-3">
        {/* Live meeting bar */}
        <CompactMeetingBar
          events={liveCalendarEvents}
          isRecording={isRecording}
          hideWhenNoEvents={hideCompactBarWhenNoEvents}
          onStartNotes={onStartNotes}
          onPrep={() => onSelectTab?.('prep')}
          onDismiss={handleDismissLiveMeeting}
        />

        {/* Upcoming meetings */}
        <UpcomingMeetingsList
          meetings={upcomingCalendarEvents}
          isCalendarConnected={isCalendarConnected}
          onNavigateSettings={handleNavigateSettings}
          onSelectMeeting={handleSelectUpcomingMeeting}
          onTakeNotes={handleTakeManualNotes}
          onViewMore={() => setShowUpcomingPopup(true)}
        />

        {/* Upcoming meetings popup modal */}
        {showUpcomingPopup && (
          <UpcomingMeetingsPopup
            meetings={upcomingCalendarEvents}
            onClose={() => setShowUpcomingPopup(false)}
            onSelectMeeting={handleSelectUpcomingMeeting}
            onTakeNotes={handleTakeManualNotes}
          />
        )}

        {/* Previous meetings */}
        <PreviousMeetingsList
          meetings={previousMeetings}
          onViewNotes={handleViewNotes}
          onViewCalendarEventNotes={handleViewCalendarEventNotes}
          onViewMore={() => setView('history')}
        />
      </div>
    </div>
  );
}

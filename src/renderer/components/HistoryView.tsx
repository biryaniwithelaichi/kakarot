import { useEffect, useState, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { Search, Trash2, Folder, Users, MessageCircle, Send, X } from 'lucide-react';
import { formatDuration, getAvatarColor, getInitials } from '../lib/formatters';
import { MeetingListSkeleton } from './Skeleton';
import { toast } from '../stores/toastStore';
import { ConfirmDialog } from './ConfirmDialog';
import MeetingDetailView from './MeetingDetailView';
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';
import { useShallow } from 'zustand/shallow';

const MEETING_ROW_HEIGHT = 92;

const useElementSize = (): [React.RefObject<HTMLDivElement>, { width: number; height: number }] => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
};

type MeetingRowData = {
  rows: Array<{
    id: string;
    title: string;
    durationLabel: string;
    attendeeEmails: string[];
    avatars: Array<{ email: string; initials: string; color: string }>;
    extraCount: number;
  }>;
  selectedMeetingId: string | null;
  onSelect: (meetingId: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
};

const MeetingRow = ({ index, style, data }: ListChildComponentProps<MeetingRowData>) => {
  const meeting = data.rows[index];
  const isSelected = data.selectedMeetingId === meeting.id;
  return (
    <div
      style={style}
      onClick={() => data.onSelect(meeting.id)}
      className={`p-4 border-b border-edge cursor-pointer transition-colors ${
        isSelected ? 'bg-edge border-l-2 border-l-accent-hover' : 'hover:bg-input'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-cream truncate">
            {meeting.title}
          </h3>
          <p className="text-xs text-muted mt-1">
            {meeting.durationLabel}
          </p>
          {meeting.attendeeEmails.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <Users className="w-3 h-3 text-dim" />
              <div className="flex -space-x-1">
                {meeting.avatars.map((avatar, idx) => (
                  <div
                    key={idx}
                    className={`w-5 h-5 rounded-full ${avatar.color} flex items-center justify-center text-white text-[10px] font-medium border border-surface`}
                    title={avatar.email}
                  >
                    {avatar.initials}
                  </div>
                ))}
                {meeting.extraCount > 0 && (
                  <div className="w-5 h-5 rounded-full bg-edge flex items-center justify-center text-muted text-[9px] font-medium border border-surface">
                    +{meeting.extraCount}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={(e) => data.onDelete(meeting.id, e)}
          className="text-dim hover:text-status-error p-1 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default function HistoryView() {
  const { meetings, setMeetings, selectedMeeting, setSelectedMeeting } = useAppStore(useShallow((state) => ({
    meetings: state.meetings,
    setMeetings: state.setMeetings,
    selectedMeeting: state.selectedMeeting,
    setSelectedMeeting: state.setSelectedMeeting,
  })));
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; meetingId: string | null }>({
    isOpen: false,
    meetingId: null,
  });
  const [listRef, listSize] = useElementSize();

  const loadMeetings = useCallback(async () => {
    setIsLoading(true);
    try {
      const meetingsList = await window.kakarot.meetings.list();
      setMeetings(meetingsList);
    } finally {
      setIsLoading(false);
    }
  }, [setMeetings]);

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      const results = await window.kakarot.meetings.search(searchQuery);
      setMeetings(results);
    } else {
      loadMeetings();
    }
  };

  const handleSelectMeetingId = useCallback(async (meetingId: string) => {
    const fullMeeting = await window.kakarot.meetings.get(meetingId);
    setSelectedMeeting(fullMeeting);
  }, [setSelectedMeeting]);

  const handleDeleteMeeting = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ isOpen: true, meetingId: id });
  };

  const confirmDeleteMeeting = async () => {
    if (!deleteConfirm.meetingId) return;
    try {
      await window.kakarot.meetings.delete(deleteConfirm.meetingId);
      if (selectedMeeting?.id === deleteConfirm.meetingId) {
        setSelectedMeeting(null);
      }
      loadMeetings();
    } catch (err) {
      console.error('Failed to delete meeting:', err);
      toast.error('Failed to delete meeting');
    }
    setDeleteConfirm({ isOpen: false, meetingId: null });
  };

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const meetingRows = useMemo(() => meetings.map((meeting) => {
    const attendeeEmails = meeting.attendeeEmails || [];
    const avatars = attendeeEmails.slice(0, 3).map((email) => ({
      email,
      initials: getInitials(email),
      color: getAvatarColor(email),
    }));
    return {
      id: meeting.id,
      title: meeting.title,
      durationLabel: formatDuration(meeting.duration),
      attendeeEmails,
      avatars,
      extraCount: Math.max(0, attendeeEmails.length - 3),
    };
  }), [meetings]);

  return (
    <div className="h-full flex bg-surface text-cream rounded-lg border border-edge shadow-overlay overflow-hidden">
      {/* Meeting list sidebar */}
      <div className="w-72 lg:w-96 border-r border-edge flex flex-col bg-card overflow-hidden flex-shrink-0">
        <div className="p-4 border-b border-edge">
          <div className="relative">
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full bg-input border border-edge text-cream rounded-md px-4 py-2.5 pl-10 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/30 placeholder:text-dim"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-dim" />
          </div>
        </div>

        <div className="flex-1 overflow-hidden" ref={listRef}>
          {isLoading ? (
            <MeetingListSkeleton count={6} />
          ) : meetings.length === 0 ? (
            <div className="p-4 text-center text-dim">No meetings yet</div>
          ) : (
            <List
              height={listSize.height || 1}
              width={listSize.width || 1}
              itemCount={meetingRows.length}
              itemSize={MEETING_ROW_HEIGHT}
              itemData={{
                rows: meetingRows,
                selectedMeetingId: selectedMeeting?.id ?? null,
                onSelect: handleSelectMeetingId,
                onDelete: handleDeleteMeeting,
              }}
              itemKey={(index: number, data: { rows: Array<{ id: string }> }) => data.rows[index].id}
              overscanCount={8}
            >
              {MeetingRow}
            </List>
          )}
        </div>
      </div>

      {/* Meeting detail -- now uses MeetingDetailView */}
      <div className="flex-1 flex flex-col bg-surface relative min-w-0">
        {selectedMeeting ? (
          <MeetingDetailView meeting={selectedMeeting} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-dim">
            <div className="text-center">
              <Folder className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-sm">Select a meeting to view details</p>
            </div>
          </div>
        )}

      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Meeting"
        message="Are you sure you want to delete this meeting? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteMeeting}
        onCancel={() => setDeleteConfirm({ isOpen: false, meetingId: null })}
      />
    </div>
  );
}

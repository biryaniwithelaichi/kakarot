import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { Calendar as CalendarIcon, Users, Loader2, Plus, Check, X } from 'lucide-react';
import { formatDuration, formatTimestamp, getSpeakerLabel } from '../lib/formatters';
import { formatMeetingDate } from '../lib/formatters';
import AttendeesList from './AttendeesList';
import { StructuredNotesView } from './StructuredNotesView';
import { NotesWithDeepDive } from './NotesWithDeepDive';
import { TranscriptDeepDive } from './TranscriptDeepDive';
import SharePopover from './SharePopover';
import AskNotesBar from './AskNotesBar';
import type { Meeting, TranscriptSegment, GeneratedStructuredNotes, Person } from '@shared/types';
import { toast } from '../stores/toastStore';

interface MeetingDetailViewProps {
  meeting: Meeting;
  isNewlyCompleted?: boolean;
  liveTranscript?: TranscriptSegment[];
}

export default function MeetingDetailView({ meeting, isNewlyCompleted, liveTranscript }: MeetingDetailViewProps) {
  const { setSelectedMeeting, meetings, setMeetings } = useAppStore();

  // Title editing
  const [titleDraft, setTitleDraft] = useState(meeting.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleFontSize, setTitleFontSize] = useState(isNewlyCompleted ? 48 : 20);
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Manual notes
  const [manualNotes, setManualNotes] = useState('');
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [noteLastSaved, setNoteLastSaved] = useState<Date | null>(null);
  const [showManualNotesInput, setShowManualNotesInput] = useState(false);
  const saveNoteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const notesInitialLoadRef = useRef(false);

  // AI response
  const [aiResponse, setAiResponse] = useState('');

  // Attendees
  const [showAttendeeModal, setShowAttendeeModal] = useState(false);
  const [showAddAttendeesPopover, setShowAddAttendeesPopover] = useState(false);
  const [contactList, setContactList] = useState<Person[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  // Sync title when meeting changes
  useEffect(() => {
    setTitleDraft(meeting.title);
    setIsEditingTitle(false);
  }, [meeting.id, meeting.title]);

  // Load manual notes
  useEffect(() => {
    const manualNoteEntries = meeting.noteEntries
      ?.filter(entry => entry.type === 'manual')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (manualNoteEntries && manualNoteEntries.length > 0) {
      setManualNotes(manualNoteEntries[0].content);
      setNoteLastSaved(new Date(manualNoteEntries[0].createdAt));
      setShowManualNotesInput(true);
    } else {
      setManualNotes('');
      setNoteLastSaved(null);
      setShowManualNotesInput(!meeting.notesMarkdown && !meeting.summary);
    }
    notesInitialLoadRef.current = true;
  }, [meeting.id]);

  // Title font size for newly completed view
  const updateTitleFontSize = useCallback(() => {
    if (!isNewlyCompleted) return;
    const container = titleContainerRef.current;
    if (!container) return;
    const availableWidth = container.clientWidth;
    if (!availableWidth) return;
    const text = titleDraft?.trim() || 'Untitled Meeting';
    const inputEl = titleInputRef.current;
    const computed = inputEl ? window.getComputedStyle(inputEl) : null;
    const fontFamily = computed?.fontFamily || 'Outfit, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    const fontWeight = computed?.fontWeight || '700';
    const maxSize = 48;
    const minSize = 24;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = `${fontWeight} ${maxSize}px ${fontFamily}`;
    const textWidth = ctx.measureText(text).width;
    const nextSize = textWidth > availableWidth
      ? Math.max(minSize, Math.floor((availableWidth / textWidth) * maxSize))
      : maxSize;
    setTitleFontSize(nextSize);
  }, [titleDraft, isNewlyCompleted]);

  useEffect(() => { updateTitleFontSize(); }, [updateTitleFontSize]);
  useEffect(() => {
    const container = titleContainerRef.current;
    if (!container || !isNewlyCompleted || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateTitleFontSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateTitleFontSize, isNewlyCompleted]);

  // Save title
  const handleTitleSave = async () => {
    const nextTitle = titleDraft.trim() || 'Untitled Meeting';
    setTitleDraft(nextTitle);
    setIsSavingTitle(true);
    try {
      await window.kakarot.meetings.updateTitle(meeting.id, nextTitle);
      setSelectedMeeting({ ...meeting, title: nextTitle });
    } catch (err) {
      console.error('Failed to update meeting title', err);
    } finally {
      setIsSavingTitle(false);
      setIsEditingTitle(false);
    }
  };

  // Autosave manual notes
  const saveManualNotes = useCallback(async (content: string) => {
    if (!meeting?.id || !content.trim()) return;
    setIsNoteSaving(true);
    try {
      await window.kakarot.meetings.saveManualNotes(meeting.id, content);
      setNoteLastSaved(new Date());
      const updatedMeeting = await window.kakarot.meetings.get(meeting.id);
      if (updatedMeeting) setSelectedMeeting(updatedMeeting);
    } catch (error) {
      console.error('Failed to save manual notes:', error);
    } finally {
      setIsNoteSaving(false);
    }
  }, [meeting?.id, setSelectedMeeting]);

  useEffect(() => {
    if (saveNoteTimerRef.current) clearTimeout(saveNoteTimerRef.current);
    if (!notesInitialLoadRef.current) return;
    if (manualNotes.trim()) {
      saveNoteTimerRef.current = setTimeout(() => saveManualNotes(manualNotes), 1000);
    }
    return () => { if (saveNoteTimerRef.current) clearTimeout(saveNoteTimerRef.current); };
  }, [manualNotes, saveManualNotes]);

  // Attendee management
  const loadContactsForPopover = useCallback(async () => {
    setIsLoadingContacts(true);
    try {
      const people = await window.kakarot.people.list();
      setContactList(people);
      setSelectedContacts(new Set(meeting.attendeeEmails || []));
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setIsLoadingContacts(false);
    }
  }, [meeting]);

  const handleAddAttendees = async () => {
    try {
      const attendeeEmailsArray = Array.from(selectedContacts);
      await window.kakarot.meetings.updateAttendees(meeting.id, attendeeEmailsArray);
      const updated = { ...meeting, attendeeEmails: attendeeEmailsArray };
      setSelectedMeeting(updated);
      setMeetings(meetings.map(m => m.id === meeting.id ? updated : m));
      setShowAddAttendeesPopover(false);
      toast.success('Attendees updated');
    } catch (error) {
      console.error('Failed to update attendees:', error);
      toast.error('Failed to update attendees');
    }
  };

  const displayDate = meeting.createdAt;
  const displayAttendees = meeting.attendeeEmails || meeting.participants || [];
  const transcript = liveTranscript || meeting.transcript;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className={`flex-shrink-0 ${isNewlyCompleted ? '' : 'p-6 border-b border-[#2A2A2A] bg-[#161616]'}`}>
        <div className="flex items-start justify-between gap-4 min-w-0">
          <div className="flex-1 space-y-3 min-w-0">
            {isNewlyCompleted ? (
              <div className="flex items-center gap-3 min-w-0" ref={titleContainerRef}>
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  style={{ fontSize: `${titleFontSize}px` }}
                  className="flex-1 min-w-0 w-full font-bold text-white leading-tight bg-transparent border-b border-transparent focus:border-[#F0EBE3] focus:outline-none"
                  placeholder="Untitled Meeting"
                />
                {isSavingTitle && <Loader2 className="w-5 h-5 animate-spin text-[#F0EBE3]" />}
              </div>
            ) : isEditingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') { setIsEditingTitle(false); setTitleDraft(meeting.title); }
                }}
                autoFocus
                className="w-full bg-transparent border-b border-[#2A2A2A] focus:border-[#D4923F] focus:outline-none text-xl font-semibold text-white break-words"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="text-left w-full text-xl font-semibold text-white break-words hover:text-slate-200"
              >
                {meeting.title}
              </button>
            )}

            <div className="flex gap-3 items-stretch flex-wrap min-w-0 max-w-full">
              <div className="flex flex-none items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#161616] px-3 py-1.5">
                <CalendarIcon className="w-4 h-4 text-slate-400" />
                <div className="text-sm text-slate-200">{formatMeetingDate(displayDate)}</div>
              </div>

              {displayAttendees.length > 0 ? (
                isNewlyCompleted ? (
                  <div className="overflow-visible">
                    <AttendeesList attendeeEmails={displayAttendees} />
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowAttendeeModal(true); setShowAddAttendeesPopover(true); loadContactsForPopover(); }}
                    className="flex flex-none items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#161616] px-3 py-1.5 hover:bg-[#1E1E1E] transition-colors cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-slate-400" />
                    <div className="text-sm text-slate-200">
                      {displayAttendees.length} Attendee{displayAttendees.length > 1 ? 's' : ''}
                    </div>
                  </button>
                )
              ) : (
                <button
                  onClick={() => { setShowAttendeeModal(true); setShowAddAttendeesPopover(true); loadContactsForPopover(); }}
                  className="flex flex-none items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#161616] hover:bg-[#1E1E1E] text-slate-100 px-3 py-1.5 text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Attendees
                </button>
              )}

              {!showManualNotesInput && !manualNotes.trim() && !meeting.notesMarkdown && (
                <button
                  onClick={() => setShowManualNotesInput(true)}
                  className="flex flex-none items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#161616] hover:bg-[#1E1E1E] text-slate-100 px-3 py-1.5 text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Notes
                </button>
              )}

              <SharePopover meeting={meeting} />
            </div>

            {!isNewlyCompleted && meeting.duration > 0 && (
              <p className="text-sm text-slate-400">{formatDuration(meeting.duration)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto ${isNewlyCompleted ? 'pb-32' : 'p-6'} space-y-6 bg-[#0C0C0C] animate-view-enter`}>
        {/* Overview */}
        {meeting.overview && (
          <div className="bg-[#161616] rounded-xl p-4 border border-[#2A2A2A]">
            {!isNewlyCompleted && <h2 className="text-sm font-medium text-slate-200 mb-2">Overview</h2>}
            <p className={`${isNewlyCompleted ? 'text-base' : 'text-sm'} leading-relaxed text-slate-100`}>{meeting.overview}</p>
          </div>
        )}

        {/* Structured notes or markdown notes */}
        {meeting.notes && typeof meeting.notes === 'object' &&
         (meeting.notes as GeneratedStructuredNotes).topics?.length > 0 ? (
          <div className="bg-[#161616] rounded-xl p-4 border border-[#2A2A2A] relative overflow-visible">
            {!isNewlyCompleted && <h2 className="text-sm font-medium text-slate-200 mb-3">Notes</h2>}
            <StructuredNotesView
              notes={meeting.notes as GeneratedStructuredNotes}
              meetingId={meeting.id}
            />
          </div>
        ) : meeting.notesMarkdown ? (
          <div className="bg-[#161616] rounded-xl p-4 border border-[#2A2A2A] relative overflow-visible">
            {!isNewlyCompleted && <h2 className="text-sm font-medium text-slate-200 mb-3">Generated Notes</h2>}
            <div className="text-lg text-slate-100">
              <NotesWithDeepDive
                notesMarkdown={meeting.notesMarkdown}
                meetingId={meeting.id}
              />
            </div>
          </div>
        ) : null}

        {/* Legacy Summary */}
        {meeting.summary && !meeting.notesMarkdown && (
          <div className="bg-[#161616] rounded-xl p-4 border border-[#2A2A2A]">
            <h2 className="text-sm font-medium text-slate-200 mb-2">Summary</h2>
            <p className="text-sm text-slate-100 whitespace-pre-wrap">{meeting.summary}</p>
          </div>
        )}

        {/* Manual Notes */}
        {(showManualNotesInput || manualNotes.trim()) && (
          <div className="bg-[#161616] rounded-xl p-4 border border-[#2A2A2A]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-slate-200">My Notes</h2>
              <div className="flex items-center gap-2 text-xs">
                {isNoteSaving && <span className="text-amber-400">Saving...</span>}
                {!isNoteSaving && noteLastSaved && (
                  <span className="text-emerald-400">
                    Saved {noteLastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
            <textarea
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Write your notes here..."
              className="w-full min-h-[120px] bg-[#1E1E1E] border border-[#2A2A2A] text-slate-100 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#C17F3E]/30 focus:border-[#C17F3E]/20 placeholder:text-slate-500 resize-y"
            />
          </div>
        )}

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className={isNewlyCompleted ? 'border-t border-[#2A2A2A] pt-6' : ''}>
            <h2 className="text-sm font-medium text-slate-200 mb-3">Transcript</h2>
            <div className="space-y-3">
              {transcript.map((segment) => (
                <div key={segment.id} className={`flex ${segment.source === 'mic' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 group ${
                      segment.source === 'mic'
                        ? 'bg-[#C17F3E]/15 text-[#F0EBE3] border border-[#C17F3E]/10'
                        : 'bg-[#1E1E1E] text-[#9C9690] border border-[#2A2A2A]'
                    }`}
                  >
                    {!isNewlyCompleted && (
                      <div className="text-xs opacity-80 mb-1">
                        {getSpeakerLabel(segment.source)} - {formatTimestamp(segment.timestamp)}
                      </div>
                    )}
                    <div className="flex items-start">
                      <p className="text-sm leading-relaxed flex-1">{segment.text}</p>
                      {!isNewlyCompleted && (
                        <TranscriptDeepDive segment={segment} meetingId={meeting.id} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ask Notes Bar */}
      <AskNotesBar meeting={meeting} onResponse={setAiResponse} />

      {/* AI Response Panel */}
      {aiResponse && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-19 max-w-2xl w-full max-h-[300px] overflow-y-auto pointer-events-auto">
          <div className="mx-4 p-4 bg-[#1E1E1E] rounded-xl border border-[#2A2A2A] shadow-soft-card">
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1 text-sm text-slate-200 whitespace-pre-wrap">{aiResponse}</p>
              <button onClick={() => setAiResponse('')} className="flex-shrink-0 text-slate-500 hover:text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendee Modal */}
      {showAttendeeModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-backdrop-in"
          onClick={() => { setShowAttendeeModal(false); setShowAddAttendeesPopover(false); }}
        >
          <div className="bg-[#161616] rounded-xl border border-[#2A2A2A] p-6 max-w-md w-full mx-4 shadow-xl animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Attendees</h3>
              <button onClick={() => { setShowAttendeeModal(false); setShowAddAttendeesPopover(false); }} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {meeting.attendeeEmails && meeting.attendeeEmails.length > 0 ? (
                meeting.attendeeEmails.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-[#1E1E1E] border border-[#2A2A2A]">
                    <div className="w-8 h-8 rounded-full bg-[#C17F3E] flex items-center justify-center text-white text-sm font-medium">
                      {email.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-sm text-white truncate flex-1">{email}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No attendees</p>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-[#2A2A2A]">
              {!showAddAttendeesPopover ? (
                <button
                  onClick={() => { setShowAddAttendeesPopover(true); loadContactsForPopover(); }}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] hover:bg-[#2A2A2A] text-slate-100 px-3 py-2 text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Attendees
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">Tag People in Note</h4>
                    <button onClick={() => setShowAddAttendeesPopover(false)} className="p-1 text-slate-400 hover:text-white transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={contactSearchQuery}
                    onChange={(e) => setContactSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#C17F3E]/50"
                  />
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {isLoadingContacts ? (
                      <p className="text-sm text-slate-400 text-center py-4">Loading contacts...</p>
                    ) : (
                      contactList
                        .filter(person =>
                          person.name?.toLowerCase().includes(contactSearchQuery.toLowerCase()) ||
                          person.email.toLowerCase().includes(contactSearchQuery.toLowerCase())
                        )
                        .map((person) => (
                          <button
                            key={person.email}
                            onClick={() => {
                              const next = new Set(selectedContacts);
                              if (next.has(person.email)) { next.delete(person.email); } else { next.add(person.email); }
                              setSelectedContacts(next);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-[#1E1E1E] hover:bg-[#2A2A2A] transition-colors text-left"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                              selectedContacts.has(person.email) ? 'bg-[#C17F3E] border-[#C17F3E]' : 'border-slate-500'
                            }`}>
                              {selectedContacts.has(person.email) && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{person.name || person.email}</p>
                              {person.name && <p className="text-xs text-slate-400 truncate">{person.email}</p>}
                            </div>
                          </button>
                        ))
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setShowAddAttendeesPopover(false)} className="flex-1 px-3 py-2 rounded-lg bg-[#1E1E1E] hover:bg-[#2A2A2A] text-white text-sm transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleAddAttendees} className="flex-1 px-3 py-2 rounded-lg bg-[#C17F3E] hover:bg-[#D4923F] text-white text-sm font-medium transition-colors">
                      Update
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

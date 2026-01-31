import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import type { Meeting } from '@shared/types';
import { Search, Trash2, Folder, Calendar as CalendarIcon, Users, Share2, Copy, Link, Mail, MessageCircle, Send, X, Plus } from 'lucide-react';
import { formatDuration, formatTimestamp, getSpeakerLabel, getAvatarColor, getInitials } from '../lib/formatters';
import { MeetingListSkeleton } from './Skeleton';
import { ConfirmDialog } from './ConfirmDialog';
import slackLogo from '../assets/slack.png';

export default function HistoryView() {
  const { meetings, setMeetings, selectedMeeting, setSelectedMeeting, searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [showAttendeeModal, setShowAttendeeModal] = useState(false);
  const [showChatPopover, setShowChatPopover] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; meetingId: string | null }>({
    isOpen: false,
    meetingId: null,
  });

  // Manual notes state
  const [manualNotes, setManualNotes] = useState('');
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [noteLastSaved, setNoteLastSaved] = useState<Date | null>(null);
  const [showManualNotesInput, setShowManualNotesInput] = useState(false);
  const saveNoteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const notesInitialLoadRef = useRef(false);

  const shareRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  const loadMeetings = useCallback(async () => {
    setIsLoading(true);
    try {
      const meetingsList = await window.kakarot.meetings.list();
      setMeetings(meetingsList);
    } finally {
      setIsLoading(false);
    }
  }, [setMeetings]);

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const response = await window.kakarot.chat.sendMessage(userMessage, {
        selectedMeetingId: selectedMeeting?.id,
        context: 'history_view'
      });
      setChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('Chat error:', error);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, selectedMeeting]);

  const handleChatKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  useEffect(() => {
    if (showChatPopover && chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [showChatPopover]);

  // Check for global search query from SearchPopup navigation
  useEffect(() => {
    if (globalSearchQuery) {
      setSearchQuery(globalSearchQuery);
      // Execute search with the global query
      window.kakarot.meetings.search(globalSearchQuery).then((results) => {
        setMeetings(results);
      });
      // Clear the global search query after consuming
      setGlobalSearchQuery(null);
    }
  }, [globalSearchQuery, setGlobalSearchQuery, setMeetings]);

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      const results = await window.kakarot.meetings.search(searchQuery);
      setMeetings(results);
    } else {
      loadMeetings();
    }
  };

  const handleSelectMeeting = async (meeting: Meeting) => {
    const fullMeeting = await window.kakarot.meetings.get(meeting.id);
    setSelectedMeeting(fullMeeting);
  };

  const handleDeleteMeeting = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ isOpen: true, meetingId: id });
  };

  const confirmDeleteMeeting = async () => {
    if (!deleteConfirm.meetingId) return;
    await window.kakarot.meetings.delete(deleteConfirm.meetingId);
    if (selectedMeeting?.id === deleteConfirm.meetingId) {
      setSelectedMeeting(null);
    }
    setDeleteConfirm({ isOpen: false, meetingId: null });
    loadMeetings();
  };

  const handleGenerateSummary = async () => {
    if (!selectedMeeting) return;
    const summary = await window.kakarot.meetings.summarize(selectedMeeting.id);
    setSelectedMeeting({ ...selectedMeeting, summary });
  };

  const handleTitleSave = async () => {
    if (!selectedMeeting) return;
    const nextTitle = titleDraft.trim() || 'Untitled Meeting';
    setTitleDraft(nextTitle);
    setSelectedMeeting({ ...selectedMeeting, title: nextTitle });
    try {
      await window.kakarot.meetings.updateTitle(selectedMeeting.id, nextTitle);
      loadMeetings();
    } catch (err) {
      console.error('Failed to update meeting title', err);
    } finally {
      setIsEditingTitle(false);
    }
  };

  useEffect(() => {
    if (selectedMeeting) {
      setTitleDraft(selectedMeeting.title);
      setIsEditingTitle(false);
    }
  }, [selectedMeeting]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(event.target as Node)) {
        setShowSharePopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load meetings on component mount
  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  // Load existing manual notes when meeting is selected
  useEffect(() => {
    if (!selectedMeeting) {
      setManualNotes('');
      setNoteLastSaved(null);
      setShowManualNotesInput(false);
      notesInitialLoadRef.current = false;
      return;
    }

    // Load manual notes from noteEntries
    const manualNoteEntries = selectedMeeting.noteEntries
      ?.filter(entry => entry.type === 'manual')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (manualNoteEntries && manualNoteEntries.length > 0) {
      setManualNotes(manualNoteEntries[0].content);
      setNoteLastSaved(new Date(manualNoteEntries[0].createdAt));
      setShowManualNotesInput(true);
    } else {
      setManualNotes('');
      setNoteLastSaved(null);
      // Show input if meeting has no generated notes
      setShowManualNotesInput(!selectedMeeting.notesMarkdown && !selectedMeeting.summary);
    }
    notesInitialLoadRef.current = true;
  }, [selectedMeeting]);

  // Autosave manual notes
  const saveManualNotes = useCallback(async (content: string) => {
    if (!selectedMeeting?.id || !content.trim()) return;

    setIsNoteSaving(true);
    try {
      await window.kakarot.meetings.saveManualNotes(selectedMeeting.id, content);
      setNoteLastSaved(new Date());
      // Refresh the meeting to get updated noteEntries
      const updatedMeeting = await window.kakarot.meetings.get(selectedMeeting.id);
      if (updatedMeeting) {
        setSelectedMeeting(updatedMeeting);
      }
    } catch (error) {
      console.error('Failed to save manual notes:', error);
    } finally {
      setIsNoteSaving(false);
    }
  }, [selectedMeeting?.id, setSelectedMeeting]);

  // Debounced autosave on notes change
  useEffect(() => {
    if (saveNoteTimerRef.current) {
      clearTimeout(saveNoteTimerRef.current);
    }

    // Don't save if not initialized or no content
    if (!notesInitialLoadRef.current) return;

    if (manualNotes.trim()) {
      saveNoteTimerRef.current = setTimeout(() => {
        saveManualNotes(manualNotes);
      }, 1000);
    }

    return () => {
      if (saveNoteTimerRef.current) {
        clearTimeout(saveNoteTimerRef.current);
      }
    };
  }, [manualNotes, saveManualNotes]);

  const handleCopyText = async () => {
    if (!selectedMeeting) return;
    const text = `${selectedMeeting.title}\n${selectedMeeting.overview || ''}\n${selectedMeeting.notesMarkdown || selectedMeeting.summary || ''}`;
    try {
      await navigator.clipboard.writeText(text);
      alert('Meeting copied to clipboard');
      setShowSharePopover(false);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handleShareLink = async () => {
    if (!selectedMeeting) return;
    const shareLink = `kakarot://meeting/${selectedMeeting.id}`;
    try {
      await navigator.clipboard.writeText(shareLink);
      alert('Share link copied to clipboard');
      setShowSharePopover(false);
    } catch (err) {
      console.error('Failed to copy share link', err);
    }
  };

  const handleEmailParticipants = async () => {
    if (!selectedMeeting) return;
    const participants = selectedMeeting.participants || [];
    const emailList = participants.join(';');
    const subject = encodeURIComponent(`Meeting Notes: ${selectedMeeting.title}`);
    const body = encodeURIComponent(`${selectedMeeting.title}\n\n${selectedMeeting.overview || selectedMeeting.notesMarkdown || selectedMeeting.summary || 'See attached notes.'}`);
    window.location.href = `mailto:${emailList}?subject=${subject}&body=${body}`;
    setShowSharePopover(false);
  };

  const handleSlack = () => {
    if (!selectedMeeting) return;
    const text = `${selectedMeeting.title}\n${selectedMeeting.overview || selectedMeeting.notesMarkdown || selectedMeeting.summary || ''}`;
    const slackText = encodeURIComponent(text);
    window.open(`https://slack.com/intl/share?url=kakarot://meeting/${selectedMeeting.id}&text=${slackText}`, '_blank');
    setShowSharePopover(false);
  };

  const formatMeetingDate = (value: string | number | Date) => {
    const date = new Date(value);
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}, ${month}/${dayOfMonth}/${year} - ${hours}:${minutes}`;
  };

  const getAttendeesLabel = (meeting: Meeting): string => {
    const { attendeeEmails, participants } = meeting;

    if (attendeeEmails && attendeeEmails.length > 0) {
      const count = attendeeEmails.length;
      return `${count} Attendee${count > 1 ? 's' : ''}`;
    }

    if (participants && participants.length > 0) {
      const display = participants.slice(0, 2).join(', ');
      const overflow = participants.length > 2 ? ` +${participants.length - 2}` : '';
      return display + overflow;
    }

    return 'Add attendees';
  };

  return (
    <div className="h-full flex bg-[#050505] text-slate-100 rounded-2xl border border-[#1A1A1A] shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-hidden">
      {/* Meeting list sidebar */}
      <div className="w-72 lg:w-96 border-r border-[#1A1A1A] flex flex-col bg-[#121212] overflow-hidden flex-shrink-0">
        {/* Search */}
        <div className="p-4 border-b border-[#1A1A1A]">
          <div className="relative">
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full bg-[#0F0F10] border border-[#1A1A1A] text-slate-100 rounded-lg px-4 py-2.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50 placeholder:text-slate-500"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          </div>
        </div>

        {/* Meeting list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <MeetingListSkeleton count={6} />
          ) : meetings.length === 0 ? (
            <div className="p-4 text-center text-slate-500">No meetings yet</div>
          ) : (
            meetings.map((meeting) => (
              <div
                key={meeting.id}
                onClick={() => handleSelectMeeting(meeting)}
                className={`p-4 border-b border-[#1A1A1A] cursor-pointer transition-colors ${
                  selectedMeeting?.id === meeting.id
                    ? 'bg-[#1A1A1A] border-l-2 border-l-[#7C3AED]'
                    : 'hover:bg-[#161616]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">
                      {meeting.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDuration(meeting.duration)}
                    </p>
                    {/* Attendee avatars */}
                    {meeting.attendeeEmails && meeting.attendeeEmails.length > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <Users className="w-3 h-3 text-slate-500" />
                        <div className="flex -space-x-1">
                          {meeting.attendeeEmails.slice(0, 3).map((email, idx) => (
                            <div
                              key={idx}
                              className={`w-5 h-5 rounded-full ${getAvatarColor(email)} flex items-center justify-center text-white text-[10px] font-medium border border-slate-900`}
                              title={email}
                            >
                              {getInitials(email)}
                            </div>
                          ))}
                          {meeting.attendeeEmails.length > 3 && (
                            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-slate-200 text-[9px] font-medium border border-slate-900">
                              +{meeting.attendeeEmails.length - 3}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDeleteMeeting(meeting.id, e)}
                    className="text-slate-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Meeting detail */}
      <div className="flex-1 flex flex-col bg-[#050505] overflow-hidden">
        {selectedMeeting ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-[#1A1A1A] bg-[#121212]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3 min-w-0">
                  {isEditingTitle ? (
                    <input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={handleTitleSave}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTitleSave();
                        if (e.key === 'Escape') {
                          setIsEditingTitle(false);
                          setTitleDraft(selectedMeeting.title);
                        }
                      }}
                      autoFocus
                      className="w-full bg-transparent border-b border-[#1A1A1A] focus:border-[#7C3AED] focus:outline-none text-2xl font-semibold text-white truncate"
                      aria-label="Edit meeting title"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(true)}
                      className="text-left w-full text-2xl font-semibold text-white truncate hover:text-slate-200"
                      aria-label="Edit meeting title"
                    >
                      {selectedMeeting.title}
                    </button>
                  )}
                  <div className="flex gap-3 items-stretch flex-wrap">
                    <div className="flex flex-none items-center gap-2 rounded-lg border border-[#1A1A1A] bg-[#171717] px-3 py-2 whitespace-nowrap">
                      <CalendarIcon className="w-4 h-4 text-slate-400" />
                      <div className="text-sm text-slate-200 whitespace-nowrap">
                        {formatMeetingDate(selectedMeeting.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if ((selectedMeeting.attendeeEmails && selectedMeeting.attendeeEmails.length > 0) ||
                            (selectedMeeting.participants && selectedMeeting.participants.length > 0)) {
                          setShowAttendeeModal(true);
                        }
                      }}
                      className="flex flex-none items-center gap-2 rounded-lg border border-[#1A1A1A] bg-[#171717] px-3 py-2 whitespace-nowrap hover:bg-[#1D1D1F] transition-colors cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-slate-400" />
                      <div className="text-sm text-slate-200 whitespace-nowrap">
                        {getAttendeesLabel(selectedMeeting)}
                      </div>
                    </button>
                    <div className="flex flex-none items-center gap-2 rounded-lg border border-[#1A1A1A] bg-[#171717] px-3 py-2 whitespace-nowrap">
                      <Folder className="w-4 h-4 text-slate-400" />
                      <div className="text-sm text-slate-200 whitespace-nowrap">No folder</div>
                    </div>
                    {!selectedMeeting.notesMarkdown && (
                      <button
                        onClick={handleGenerateSummary}
                        className="flex flex-none items-center gap-2 rounded-lg border border-[#1A1A1A] bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-2 whitespace-nowrap text-sm transition-colors"
                      >
                        Generate Notes
                      </button>
                    )}
                    <div className="relative" ref={shareRef}>
                      <button
                        onClick={() => setShowSharePopover((prev) => !prev)}
                        className="flex flex-none items-center gap-2 rounded-lg border border-[#1A1A1A] bg-[#171717] hover:bg-[#1D1D1F] text-slate-100 px-3 py-2 whitespace-nowrap text-sm transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                        Share
                      </button>
                      {showSharePopover && (
                        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-700 bg-[#121212] shadow-soft-card p-3 space-y-2 z-50">
                          <p className="text-xs text-slate-400 px-1">Share your meeting</p>
                          <button
                            onClick={handleCopyText}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#171717] hover:bg-[#1D1D1F] text-slate-100 text-sm transition-colors"
                          >
                            <Copy className="w-4 h-4 text-slate-400" />
                            <span>Copy Text</span>
                          </button>
                          <button
                            onClick={handleShareLink}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#171717] hover:bg-[#1D1D1F] text-slate-100 text-sm transition-colors"
                          >
                            <Link className="w-4 h-4 text-slate-400" />
                            <span>Shareable Link</span>
                          </button>
                          <button
                            onClick={handleEmailParticipants}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#171717] hover:bg-[#1D1D1F] text-slate-100 text-sm transition-colors"
                          >
                            <Mail className="w-4 h-4 text-slate-400" />
                            <span>Email Participants</span>
                          </button>
                          <button
                            onClick={handleSlack}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#171717] hover:bg-[#1D1D1F] text-slate-100 text-sm transition-colors"
                          >
                            <img src={slackLogo} alt="Slack" className="w-4 h-4" />
                            <span>Send to Slack</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-400">
                    {formatDuration(selectedMeeting.duration)} · {selectedMeeting.transcript.length} segments
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#050505]">
              {/* Overview */}
              {selectedMeeting.overview && (
                <div className="bg-[#121212] rounded-xl p-4 border border-[#1A1A1A]">
                  <h2 className="text-sm font-medium text-slate-200 mb-2">Overview</h2>
                  <p className="text-sm text-slate-100">{selectedMeeting.overview}</p>
                </div>
              )}

              {/* Manual Notes */}
              <div className="bg-[#121212] rounded-xl p-4 border border-[#1A1A1A]">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-slate-200">My Notes</h2>
                  <div className="flex items-center gap-2 text-xs">
                    {isNoteSaving && (
                      <span className="text-amber-400">Saving...</span>
                    )}
                    {!isNoteSaving && noteLastSaved && (
                      <span className="text-emerald-400">
                        Saved {noteLastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {!showManualNotesInput && (
                      <button
                        onClick={() => setShowManualNotesInput(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#1A1A1A] hover:bg-[#222222] text-slate-300 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    )}
                  </div>
                </div>
                {showManualNotesInput ? (
                  <textarea
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="Write your notes here..."
                    className="w-full min-h-[120px] bg-[#0F0F10] border border-[#1A1A1A] text-slate-100 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50 placeholder:text-slate-500 resize-y"
                  />
                ) : (
                  <p className="text-sm text-slate-500 italic">No manual notes yet. Click "Add" to start writing.</p>
                )}
              </div>

              {/* Generated Notes */}
              {selectedMeeting.notesMarkdown && (
                <div className="bg-[#121212] rounded-xl p-4 border border-[#1A1A1A]">
                  <h2 className="text-sm font-medium text-slate-200 mb-2">Generated Notes</h2>
                  <div className="text-sm text-slate-100 whitespace-pre-wrap prose prose-invert prose-sm max-w-none">
                    {selectedMeeting.notesMarkdown}
                  </div>
                </div>
              )}

              {/* Legacy Summary */}
              {selectedMeeting.summary && !selectedMeeting.notesMarkdown && (
                <div className="bg-[#121212] rounded-xl p-4 border border-[#1A1A1A]">
                  <h2 className="text-sm font-medium text-slate-200 mb-2">Summary</h2>
                  <p className="text-sm text-slate-100 whitespace-pre-wrap">
                    {selectedMeeting.summary}
                  </p>
                </div>
              )}

              {/* Transcript */}
              <div>
                <h2 className="text-sm font-medium text-slate-200 mb-3">Transcript</h2>
                <div className="space-y-3">
                  {selectedMeeting.transcript.map((segment) => (
                    <div
                      key={segment.id}
                      className={`flex ${
                        segment.source === 'mic' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          segment.source === 'mic'
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                            : 'bg-[#121212] text-slate-100 border border-[#1A1A1A]'
                        }`}
                      >
                        <div className="text-xs opacity-80 mb-1">
                          {getSpeakerLabel(segment.source)} -{' '}
                          {formatTimestamp(segment.timestamp)}
                        </div>
                        <p className="text-sm leading-relaxed">{segment.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <Folder className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-sm">Select a meeting to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Attendee Modal */}
      {showAttendeeModal && selectedMeeting && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAttendeeModal(false)}
        >
          <div 
            className="bg-[#121212] rounded-xl border border-[#1A1A1A] p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Attendees</h3>
              <button
                onClick={() => setShowAttendeeModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {selectedMeeting.attendeeEmails && selectedMeeting.attendeeEmails.length > 0 ? (
                selectedMeeting.attendeeEmails.map((email, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-[#171717] border border-[#1A1A1A]">
                    <div className={`w-8 h-8 rounded-full ${getAvatarColor(email)} flex items-center justify-center text-white text-sm font-medium`}>
                      {getInitials(email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{email}</p>
                    </div>
                  </div>
                ))
              ) : selectedMeeting.participants && selectedMeeting.participants.length > 0 ? (
                selectedMeeting.participants.map((participant, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-[#171717] border border-[#1A1A1A]">
                    <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-white text-sm font-medium">
                      {participant[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{participant}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No attendees</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Chat Pill */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <button
          onClick={() => setShowChatPopover(!showChatPopover)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-full shadow-lg transition-all duration-200 hover:shadow-xl"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="text-sm font-medium">Ask Me Anything</span>
        </button>
      </div>

      {/* Chat Popover */}
      {showChatPopover && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 w-96 max-h-96 bg-[#121212] border border-[#1A1A1A] rounded-xl shadow-2xl z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#1A1A1A]">
            <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
            <button
              onClick={() => setShowChatPopover(false)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-64">
            {chatMessages.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-4">
                Ask me anything about your meetings!
              </div>
            ) : (
              chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-[#1A1A1A] text-slate-200'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))
            )}
            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#1A1A1A] rounded-lg px-3 py-2 text-sm text-slate-200">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-[#1A1A1A]">
            <div className="flex gap-2">
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={handleChatKeyPress}
                placeholder="Ask about your meetings..."
                className="flex-1 bg-[#0F0F10] border border-[#1A1A1A] text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-500"
                disabled={isChatLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isChatLoading}
                className="px-3 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

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

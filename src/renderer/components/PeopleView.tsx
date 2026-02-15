import React, { useEffect, useState, useCallback } from 'react';
import { Search, Mail, Building2, Calendar, Clock, FileText, Edit2, X, Check, RefreshCw, MessageSquare } from 'lucide-react';
import type { Person, Meeting, GeneratedStructuredNotes } from '@shared/types';
import { formatDuration, getAvatarColor, getInitials, formatLastMeeting } from '../lib/formatters';
import { PersonListSkeleton } from './Skeleton';
import { useAppStore } from '../stores/appStore';
import { NotesWithDeepDive } from './NotesWithDeepDive';
import { StructuredNotesView } from './StructuredNotesView';

export default function PeopleView() {
  const { setSelectedMeeting, navigate } = useAppStore();
  const [people, setPeople] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingField, setEditingField] = useState<'name' | 'organization' | 'notes' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contactMeetings, setContactMeetings] = useState<Meeting[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [showNotesPopup, setShowNotesPopup] = useState(false);
  const [selectedMeetingForModal, setSelectedMeetingForModal] = useState<Meeting | null>(null);

  const loadPeople = useCallback(async () => {
    setIsLoading(true);
    try {
      const peopleList = await window.kakarot.people.list();
      setPeople(peopleList);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncFromCalendar = async () => {
    setIsSyncing(true);
    try {
      // First cleanup names with numbers
      const cleanupResult = await window.kakarot.people.cleanupNames();
      console.log('Cleaned up names:', cleanupResult);
      
      // Then sync from calendar
      const result = await window.kakarot.people.syncFromCalendar();
      console.log('Synced contacts from calendar:', result);
      await loadPeople(); // Refresh the list after sync
    } catch (error) {
      console.error('Failed to sync contacts from calendar:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const loadContactMeetings = useCallback(async (email: string) => {
    setIsLoadingMeetings(true);
    try {
      const allMeetings = await window.kakarot.meetings.list();
      // Filter meetings where the contact's email is in attendeeEmails
      const filtered = allMeetings.filter(meeting => 
        meeting.attendeeEmails.includes(email) && meeting.endedAt !== null
      );
      // Sort by most recent first
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setContactMeetings(filtered);
    } catch (error) {
      console.error('Failed to load contact meetings:', error);
      setContactMeetings([]);
    } finally {
      setIsLoadingMeetings(false);
    }
  }, []);

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      const results = await window.kakarot.people.search(searchQuery);
      setPeople(results);
    } else {
      loadPeople();
    }
  };

  const handleSelectPerson = (person: Person) => {
    setSelectedPerson(person);
    setEditingField(null);
    loadContactMeetings(person.email);
  };

  const handleMeetingClick = (meeting: Meeting) => {
    // Switch to history view and select the meeting
    setSelectedMeeting(meeting);
    navigate('meeting-detail', { meetingId: meeting.id });
  };

  const handleViewNotes = (e: React.MouseEvent, meeting: Meeting) => {
    e.stopPropagation();
    setSelectedMeetingForModal(meeting);
    setShowNotesPopup(true);
  };

  const hasNotes = (meeting: Meeting): boolean => {
    return (
      (meeting.noteEntries && meeting.noteEntries.length > 0) ||
      !!meeting.notesMarkdown ||
      !!meeting.notesPlain
    );
  };

  const startEditing = (field: 'name' | 'organization' | 'notes', currentValue: string | undefined) => {
    setEditingField(field);
    setEditValue(currentValue || '');
  };

  const saveEdit = async () => {
    if (!selectedPerson || !editingField) return;

    try {
      let updatedPerson: Person | null = null;

      switch (editingField) {
        case 'name':
          updatedPerson = await window.kakarot.people.updateName(selectedPerson.email, editValue);
          break;
        case 'organization':
          updatedPerson = await window.kakarot.people.updateOrganization(selectedPerson.email, editValue);
          break;
        case 'notes':
          updatedPerson = await window.kakarot.people.updateNotes(selectedPerson.email, editValue);
          break;
      }

      if (updatedPerson) {
        setSelectedPerson(updatedPerson);
        setPeople(people.map(p => p.email === updatedPerson!.email ? updatedPerson! : p));
      }

      setEditingField(null);
      setEditValue('');
    } catch (error) {
      console.error('Failed to update person:', error);
    }
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const getPersonInitials = (person: Person): string => {
    return getInitials(person.email, person.name);
  };

  return (
    <React.Fragment>
      <div className="h-full flex bg-[#0C0C0C] text-slate-100 rounded-2xl border border-[#2A2A2A] shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-hidden">
        {/* People list sidebar */}
        <div className="w-64 lg:w-80 border-r border-[#2A2A2A] flex flex-col bg-[#161616] flex-shrink-0 overflow-hidden">
          {/* Search */}
          <div className="p-4 border-b border-[#2A2A2A] flex-shrink-0">
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Contacts</h2>
              <button
                onClick={syncFromCalendar}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-[#2A2A2A] rounded-lg transition-colors disabled:opacity-50"
                title="Sync contacts from calendar events"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {people.length} {people.length === 1 ? 'contact' : 'contacts'}
            </p>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-slate-100 rounded-lg px-4 py-2.5 pl-10 text-sm focus:outline-none focus:ring-1 focus:ring-[#C17F3E]/30 focus:border-[#C17F3E]/20 placeholder:text-slate-500"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          </div>
        </div>

        {/* People list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <PersonListSkeleton count={6} />
          ) : people.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-slate-600 mb-2">
                <Mail className="w-12 h-12 mx-auto mb-3" />
              </div>
              <p className="text-slate-400 font-medium">No contacts yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Contacts are automatically created from meeting attendees
              </p>
            </div>
          ) : (
            people.map((person) => (
              <div
                key={person.email}
                onClick={() => handleSelectPerson(person)}
                className={`p-4 border-b border-[#2A2A2A] cursor-pointer transition-colors ${
                  selectedPerson?.email === person.email
                    ? 'bg-[#2A2A2A] border-l-2 border-l-[#D4923F]'
                    : 'hover:bg-[#1E1E1E]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${getAvatarColor(person.email)} flex items-center justify-center text-white font-medium text-sm flex-shrink-0`}>
                    {getPersonInitials(person)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-slate-100 truncate">
                      {person.name || person.email}
                    </h3>
                    {person.name && (
                      <p className="text-xs text-slate-500 truncate">{person.email}</p>
                    )}
                    {person.organization && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{person.organization}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {person.meetingCount} {person.meetingCount === 1 ? 'meeting' : 'meetings'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(person.totalDuration)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Contact detail panel */}
      <div className="flex-1 flex flex-col bg-[#0C0C0C] overflow-hidden">
        {selectedPerson ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-[#2A2A2A] bg-[#161616] flex-shrink-0">
              <div className="flex items-start gap-4">
                <div className={`w-16 h-16 rounded-full ${getAvatarColor(selectedPerson.email)} flex items-center justify-center text-white font-medium text-xl flex-shrink-0`}>
                  {getPersonInitials(selectedPerson)}
                </div>
                <div className="flex-1 min-w-0">
                  {editingField === 'name' ? (
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="flex-1 px-3 py-1.5 text-xl font-semibold text-white bg-[#161616] border border-[#2A2A2A] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C17F3E]/30 focus:border-[#C17F3E]/20"
                        autoFocus
                        placeholder="Enter name"
                      />
                      <button
                        onClick={saveEdit}
                        className="p-1.5 text-[#F0EBE3] hover:bg-[#161616] rounded-lg transition-colors"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1.5 text-slate-400 hover:bg-[#161616] rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-2xl font-semibold text-white">
                        {selectedPerson.name || 'Unnamed Contact'}
                      </h1>
                      <button
                        onClick={() => startEditing('name', selectedPerson.name)}
                        className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-[#161616] rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">{selectedPerson.email}</span>
                  </div>

                  {editingField === 'organization' ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Building2 className="w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="flex-1 px-3 py-1 text-sm text-slate-200 bg-[#161616] border border-[#2A2A2A] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#C17F3E]/30 focus:border-[#C17F3E]/20"
                        autoFocus
                        placeholder="Enter organization"
                      />
                      <button onClick={saveEdit} className="p-1 text-[#F0EBE3] hover:bg-[#161616] rounded">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={cancelEdit} className="p-1 text-slate-400 hover:bg-[#161616] rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <Building2 className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-400">
                        {selectedPerson.organization || 'No organization'}
                      </span>
                      <button
                        onClick={() => startEditing('organization', selectedPerson.organization)}
                        className="p-1 text-slate-500 hover:text-slate-300 hover:bg-[#161616] rounded transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="bg-[#161616] rounded-lg p-3 border border-[#2A2A2A]">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-medium">Meetings</span>
                  </div>
                  <div className="text-2xl font-semibold text-white">{selectedPerson.meetingCount}</div>
                </div>
                <div className="bg-[#161616] rounded-lg p-3 border border-[#2A2A2A]">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-medium">Total Time</span>
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    {formatDuration(selectedPerson.totalDuration)}
                  </div>
                </div>
                <div className="bg-[#161616] rounded-lg p-3 border border-[#2A2A2A]">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-medium">Last Met</span>
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {formatLastMeeting(selectedPerson.lastMeetingAt)}
                  </div>
                </div>
              </div>
            </div>

            {/* Notes section */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#0C0C0C]">
              <div className="max-w-3xl space-y-6">
                {/* Notes */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-slate-400" />
                      <h2 className="text-lg font-semibold text-white">Notes</h2>
                    </div>
                    {editingField !== 'notes' && (
                      <button
                        onClick={() => startEditing('notes', selectedPerson.notes)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:bg-[#161616] rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                  </div>

                  {editingField === 'notes' ? (
                    <div className="space-y-3">
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full h-64 px-4 py-3 text-sm text-slate-200 bg-[#161616] border border-[#2A2A2A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C17F3E]/50 resize-none font-mono placeholder:text-slate-500"
                        placeholder="Add notes about this contact..."
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 text-sm text-slate-400 hover:bg-[#161616] rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveEdit}
                          className="px-4 py-2 text-sm text-white bg-[#C17F3E] hover:bg-[#D4923F] rounded-lg transition-colors"
                        >
                          Save Notes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#161616] rounded-lg p-4 border border-[#2A2A2A]">
                      {selectedPerson.notes ? (
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedPerson.notes}</p>
                      ) : (
                        <p className="text-sm text-slate-500 italic">No notes yet. Click Edit to add notes about this contact.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Meeting History */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="w-5 h-5 text-slate-400" />
                    <h2 className="text-lg font-semibold text-white">Meeting History</h2>
                    <span className="text-sm text-slate-500">({contactMeetings.length})</span>
                  </div>

                  {isLoadingMeetings ? (
                    <div className="bg-[#161616] rounded-lg p-8 border border-[#2A2A2A] flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C17F3E]"></div>
                    </div>
                  ) : contactMeetings.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {contactMeetings.map((meeting) => (
                        <button
                          key={meeting.id}
                          onClick={() => handleMeetingClick(meeting)}
                          className="bg-[#161616] rounded-lg p-4 border border-[#2A2A2A] hover:border-[#C17F3E]/50 hover:bg-[#161616] transition-all text-left"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-base font-medium text-white mb-1 hover:text-[#C17F3E] transition-colors line-clamp-1">
                                {meeting.title}
                              </h3>
                              <div className="flex items-center gap-3 text-sm text-slate-400">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>{new Date(meeting.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>{formatDuration(meeting.duration)}</span>
                                </div>
                              </div>
                            </div>
                            {hasNotes(meeting) && (
                              <button
                                onClick={(e) => handleViewNotes(e, meeting)}
                                className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-[#C17F3E] border border-[#C17F3E]/50 hover:border-[#C17F3E] hover:bg-[#C17F3E]/10 rounded-lg transition-all"
                              >
                                View Notes
                              </button>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[#161616] rounded-lg p-8 border border-[#2A2A2A] text-center">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-sm text-slate-500">No meetings recorded with this contact yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <Mail className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium text-slate-400">Select a contact</p>
              <p className="text-sm text-slate-500 mt-1">Choose a contact to view details</p>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Modal Backdrop - Click to close */}
      {showNotesPopup && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowNotesPopup(false);
            setSelectedMeetingForModal(null);
          }}
        />
      )}

      {/* Notes Modal - Full Meeting View */}
      {showNotesPopup && selectedMeetingForModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161616] border border-[#2A2A2A] rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-[#2A2A2A] bg-[#161616] flex-shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3 min-w-0">
                  <h1 className="text-2xl font-semibold text-white truncate">{selectedMeetingForModal.title}</h1>
                  <div className="flex gap-3 items-stretch flex-wrap">
                    <div className="flex flex-none items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#161616] px-3 py-2 whitespace-nowrap">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <div className="text-sm text-slate-200 whitespace-nowrap">
                        {new Date(selectedMeetingForModal.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {(selectedMeetingForModal.attendeeEmails && selectedMeetingForModal.attendeeEmails.length > 0) && (
                      <div className="flex flex-none items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#161616] px-3 py-2 whitespace-nowrap">
                        <MessageSquare className="w-4 h-4 text-slate-400" />
                        <div className="text-sm text-slate-200 whitespace-nowrap">
                          {selectedMeetingForModal.attendeeEmails.length} attendee{selectedMeetingForModal.attendeeEmails.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-none items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#161616] px-3 py-2 whitespace-nowrap">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <div className="text-sm text-slate-200 whitespace-nowrap">
                        {formatDuration(selectedMeetingForModal.duration)}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-400">
                    {formatDuration(selectedMeetingForModal.duration)} · {selectedMeetingForModal.transcript.length} segments
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowNotesPopup(false);
                    setSelectedMeetingForModal(null);
                  }}
                  className="p-2 text-slate-400 hover:text-white hover:bg-[#161616] rounded-lg transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Content - Notes and Transcript */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0C0C0C]">
              {/* Overview */}
              {selectedMeetingForModal.overview && (
                <div className="bg-[#161616] rounded-xl p-4 border border-[#2A2A2A]">
                  <h2 className="text-sm font-medium text-slate-200 mb-2">Overview</h2>
                  <p className="text-sm text-slate-100">{selectedMeetingForModal.overview}</p>
                </div>
              )}

              {/* Generated Notes - prefer structured view when available */}
              {selectedMeetingForModal.notes && typeof selectedMeetingForModal.notes === 'object' &&
               (selectedMeetingForModal.notes as GeneratedStructuredNotes).topics?.length > 0 ? (
                <div className="bg-[#161616] rounded-xl p-4 border border-[#2A2A2A] relative overflow-visible">
                  <h2 className="text-sm font-medium text-slate-200 mb-3">Notes</h2>
                  <StructuredNotesView
                    notes={selectedMeetingForModal.notes as GeneratedStructuredNotes}
                    meetingId={selectedMeetingForModal.id}
                  />
                </div>
              ) : selectedMeetingForModal.notesMarkdown ? (
                <div className="bg-[#161616] rounded-xl p-4 border border-[#2A2A2A] relative overflow-visible">
                  <h2 className="text-sm font-medium text-slate-200 mb-3">Generated Notes</h2>
                  <div className="text-lg text-slate-100">
                    <NotesWithDeepDive
                      notesMarkdown={selectedMeetingForModal.notesMarkdown}
                      meetingId={selectedMeetingForModal.id}
                    />
                  </div>
                </div>
              ) : null}

              {/* Legacy Summary */}
              {selectedMeetingForModal.summary && !selectedMeetingForModal.notesMarkdown && (
                <div className="bg-[#161616] rounded-xl p-4 border border-[#2A2A2A]">
                  <h2 className="text-sm font-medium text-slate-200 mb-2">Summary</h2>
                  <p className="text-sm text-slate-100 whitespace-pre-wrap">
                    {selectedMeetingForModal.summary}
                  </p>
                </div>
              )}

              {/* Transcript */}
              <div>
                <h2 className="text-sm font-medium text-slate-200 mb-3">Transcript</h2>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {selectedMeetingForModal.transcript.length > 0 ? (
                    selectedMeetingForModal.transcript.map((segment, idx) => (
                      <div
                        key={idx}
                        className={`flex ${
                          segment.source === 'mic' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            segment.source === 'mic'
                              ? 'bg-[#C17F3E]/15 text-[#F0EBE3] border border-[#C17F3E]/10'
                              : 'bg-[#1E1E1E] text-[#9C9690] border border-[#2A2A2A]'
                          }`}
                        >
                          <p className="text-sm leading-relaxed">{segment.text}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No transcript available</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
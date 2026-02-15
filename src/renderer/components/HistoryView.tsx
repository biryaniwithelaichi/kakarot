import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import type { Meeting } from '@shared/types';
import { Search, Trash2, Folder, Users, MessageCircle, Send, X } from 'lucide-react';
import { formatDuration, getAvatarColor, getInitials } from '../lib/formatters';
import { MeetingListSkeleton } from './Skeleton';
import { ConfirmDialog } from './ConfirmDialog';
import MeetingDetailView from './MeetingDetailView';

export default function HistoryView() {
  const { meetings, setMeetings, selectedMeeting, setSelectedMeeting } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; meetingId: string | null }>({
    isOpen: false,
    meetingId: null,
  });

  // Chat state
  const [showChatPopover, setShowChatPopover] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatInputRef = { current: null as HTMLInputElement | null };

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
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
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

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  return (
    <div className="h-full flex bg-[#0C0C0C] text-slate-100 rounded-2xl border border-[#2A2A2A] shadow-[0_8px_30px_rgba(0,0,0,0.35)] overflow-hidden">
      {/* Meeting list sidebar */}
      <div className="w-72 lg:w-96 border-r border-[#2A2A2A] flex flex-col bg-[#161616] overflow-hidden flex-shrink-0">
        <div className="p-4 border-b border-[#2A2A2A]">
          <div className="relative">
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-slate-100 rounded-lg px-4 py-2.5 pl-10 text-sm focus:outline-none focus:ring-1 focus:ring-[#C17F3E]/30 focus:border-[#C17F3E]/20 placeholder:text-slate-500"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <MeetingListSkeleton count={6} />
          ) : meetings.length === 0 ? (
            <div className="p-4 text-center text-slate-500">No meetings yet</div>
          ) : (
            meetings.map((meeting, index) => (
              <div
                key={meeting.id}
                onClick={() => handleSelectMeeting(meeting)}
                className={`p-4 border-b border-[#2A2A2A] cursor-pointer transition-all duration-200 animate-stagger-in ${
                  selectedMeeting?.id === meeting.id
                    ? 'bg-[#2A2A2A] border-l-2 border-l-[#D4923F]'
                    : 'hover:bg-[#1E1E1E]'
                }`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">
                      {meeting.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDuration(meeting.duration)}
                    </p>
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
                            <div className="w-5 h-5 rounded-full bg-[#2A2A2A] flex items-center justify-center text-slate-200 text-[9px] font-medium border border-slate-900">
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

      {/* Meeting detail -- now uses MeetingDetailView */}
      <div className="flex-1 flex flex-col bg-[#0C0C0C] relative z-10 min-w-0">
        {selectedMeeting ? (
          <MeetingDetailView meeting={selectedMeeting} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <Folder className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-sm">Select a meeting to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Chat Pill */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <button
          onClick={() => setShowChatPopover(!showChatPopover)}
          className="flex items-center gap-2 px-4 py-2 bg-[#C17F3E] hover:bg-[#D4923F] text-[#0C0C0C] rounded-full shadow-copper-soft transition-all duration-200 hover:shadow-copper-glow active:scale-[0.96]"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="text-sm font-medium">Ask Me Anything</span>
        </button>
      </div>

      {/* Chat Popover */}
      {showChatPopover && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 w-96 max-h-96 bg-[#161616] border border-[#2A2A2A] rounded-xl shadow-2xl z-50 flex flex-col animate-popover-in-up">
          <div className="flex items-center justify-between p-4 border-b border-[#2A2A2A]">
            <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
            <button onClick={() => setShowChatPopover(false)} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-64">
            {chatMessages.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-4">
                Ask me anything about your meetings!
              </div>
            ) : (
              chatMessages.map((message, index) => (
                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-[#C17F3E]/20 text-[#F0EBE3] border border-[#C17F3E]/15'
                        : 'bg-[#1E1E1E] text-[#9C9690] border border-[#2A2A2A]'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))
            )}
            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-slate-200">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-[#2A2A2A]">
            <div className="flex gap-2">
              <input
                ref={(el) => { chatInputRef.current = el; }}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={handleChatKeyPress}
                placeholder="Ask about your meetings..."
                className="flex-1 bg-[#1E1E1E] border border-[#2A2A2A] text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C17F3E]/50 placeholder:text-slate-500"
                disabled={isChatLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isChatLoading}
                className="px-3 py-2 bg-[#C17F3E] hover:bg-[#D4923F] disabled:bg-[#2A2A2A] disabled:cursor-not-allowed text-[#0C0C0C] rounded-lg transition-colors"
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

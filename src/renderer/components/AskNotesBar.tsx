import React, { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { Meeting } from '@shared/types';

interface AskNotesBarProps {
  meeting: Meeting;
  onResponse?: (response: string) => void;
}

export default function AskNotesBar({ meeting, onResponse }: AskNotesBarProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setError('');

    try {
      // Call the AI with the query, meeting transcript, and notes
      const response = await window.kakarot.meetings.askNotes(meeting.id, input);
      
      if (response) {
        onResponse?.(response);
        setInput('');
      } else {
        setError('Failed to get a response. Please try again.');
      }
    } catch (err) {
      console.error('Error asking notes:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <form
        onSubmit={handleSubmit}
        className="px-4 py-2.5 rounded-full border border-white/30 dark:border-white/10 bg-white/70 dark:bg-[#0C0C0C]/70 backdrop-blur-md shadow-soft-card flex items-center gap-2 min-w-[320px]"
      >
        <input
          type="text"
          placeholder="Ask your notes…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          className="bg-transparent outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 flex-1 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="p-1.5 rounded-full hover:bg-white/20 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-600 dark:text-slate-300" />
          ) : (
            <Send className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          )}
        </button>
      </form>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2 text-center">{error}</p>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2, Quote, Lightbulb, MessageCircle } from 'lucide-react';
import type { NotesDeepDiveResult } from '@shared/types';

interface NotesWithDeepDiveProps {
  notesMarkdown: string;
  meetingId: string;
}

interface NoteLineProps {
  content: string;
  meetingId: string;
  isListItem: boolean;
  listPrefix?: string;
}

function NoteLine({ content, meetingId, isListItem, listPrefix }: NoteLineProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<NotesDeepDiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleDeepDive = async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    setIsLoading(true);
    setError(null);

    try {
      const deepDiveResult = await window.kakarot.notes.deepDive(meetingId, content);
      setResult(deepDiveResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze note');
    } finally {
      setIsLoading(false);
    }
  };

  // Don't show deep dive for empty lines or very short content
  const showDeepDive = content.trim().length > 10;

  return (
    <div
      ref={lineRef}
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex items-start gap-2 ${isListItem ? 'pl-0' : ''}`}>
        {isListItem && listPrefix && (
          <span className="text-slate-400 flex-shrink-0 select-none">{listPrefix}</span>
        )}
        <span className="flex-1">{content}</span>

        {showDeepDive && (
          <button
            ref={triggerRef}
            onClick={handleDeepDive}
            className={`flex-shrink-0 p-1 rounded-full transition-all duration-200 ${
              isHovered || isOpen
                ? 'opacity-100 bg-purple-500/20 hover:bg-purple-500/30'
                : 'opacity-0 pointer-events-none'
            }`}
            title="Deep dive into this note"
          >
            <Search className="w-3.5 h-3.5 text-purple-400" />
          </button>
        )}
      </div>

      {/* Popover Card */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 w-[420px] rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] shadow-2xl"
          style={{
            bottom: '100%',
            left: '0',
            marginBottom: '8px',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2A2A]">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-white">Transcript Summary</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-3" />
                <p className="text-sm text-slate-400">Finding transcript context...</p>
              </div>
            ) : error ? (
              <div className="text-center py-6">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={handleDeepDive}
                  className="mt-3 text-xs text-purple-400 hover:text-purple-300"
                >
                  Try again
                </button>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {/* The Context */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MessageCircle className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
                      The Context
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {result.context}
                  </p>
                </div>

                {/* The Verbatim Quote */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Quote className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                      The Verbatim Quote
                    </span>
                  </div>
                  <div className="bg-[#0F0F10] border border-[#2A2A2A] rounded-lg p-3">
                    <p className="text-sm text-white italic leading-relaxed">
                      "{result.verbatimQuote}"
                    </p>
                  </div>
                </div>

                {/* The Implication */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                      The Implication
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {result.implication}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Arrow pointer */}
          <div
            className="absolute w-3 h-3 bg-[#1A1A1A] border-r border-b border-[#2A2A2A] transform rotate-45"
            style={{
              bottom: '-6px',
              left: '20px',
            }}
          />
        </div>
      )}
    </div>
  );
}

export function NotesWithDeepDive({ notesMarkdown, meetingId }: NotesWithDeepDiveProps) {
  // Parse the markdown into lines for rendering
  const lines = notesMarkdown.split('\n');

  return (
    <div className="space-y-1">
      {lines.map((line, index) => {
        const trimmedLine = line.trim();

        // Skip empty lines but preserve spacing
        if (!trimmedLine) {
          return <div key={index} className="h-2" />;
        }

        // Check if it's a header
        if (trimmedLine.startsWith('###')) {
          return (
            <h4 key={index} className="text-sm font-semibold text-slate-200 mt-4 mb-2">
              {trimmedLine.replace(/^###\s*/, '')}
            </h4>
          );
        }
        if (trimmedLine.startsWith('##')) {
          return (
            <h3 key={index} className="text-base font-semibold text-slate-100 mt-4 mb-2">
              {trimmedLine.replace(/^##\s*/, '')}
            </h3>
          );
        }
        if (trimmedLine.startsWith('#')) {
          return (
            <h2 key={index} className="text-lg font-bold text-white mt-4 mb-2">
              {trimmedLine.replace(/^#\s*/, '')}
            </h2>
          );
        }

        // Check if it's a list item
        const bulletMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
        const numberedMatch = trimmedLine.match(/^(\d+\.)\s+(.+)$/);

        if (bulletMatch) {
          return (
            <NoteLine
              key={index}
              content={bulletMatch[1]}
              meetingId={meetingId}
              isListItem={true}
              listPrefix="•"
            />
          );
        }

        if (numberedMatch) {
          return (
            <NoteLine
              key={index}
              content={numberedMatch[2]}
              meetingId={meetingId}
              isListItem={true}
              listPrefix={numberedMatch[1]}
            />
          );
        }

        // Regular paragraph
        return (
          <NoteLine
            key={index}
            content={trimmedLine}
            meetingId={meetingId}
            isListItem={false}
          />
        );
      })}
    </div>
  );
}

export default NotesWithDeepDive;

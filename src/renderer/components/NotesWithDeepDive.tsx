import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2, Quote, Lightbulb, MessageCircle } from 'lucide-react';
import type { EnhancedDeepDiveResult } from '@shared/types';
import { usePopoverPosition } from '../lib/popoverUtils';
import { formatTimestamp, getSpeakerLabel } from '../lib/formatters';

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
  const [result, setResult] = useState<EnhancedDeepDiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  const popoverPosition = usePopoverPosition(isOpen, triggerRef, 480, 450, 'above');

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
      const deepDiveResult = await window.kakarot.notes.enhancedDeepDive(meetingId, content);
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
                ? 'opacity-100 bg-[#4ea8dd]/20 hover:bg-[#4ea8dd]/30'
                : 'opacity-0 pointer-events-none'
            }`}
            title="Deep dive into this note"
          >
            <Search className="w-3.5 h-3.5 text-[#4ea8dd]" />
          </button>
        )}
      </div>

      {/* Popover Card */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="fixed z-[9999] w-[480px] max-h-[450px] rounded-xl border border-[#2A2A2A] bg-[#2A2A2A] shadow-2xl flex flex-col"
          style={{
            top: `${popoverPosition.top}px`,
            left: `${popoverPosition.left}px`,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2A2A] flex-shrink-0">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-[#4ea8dd]" />
              <span className="text-sm font-medium text-slate-200">Deep Dive</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-[#4ea8dd] animate-spin mb-3" />
                <p className="text-sm text-slate-400">Analyzing transcript...</p>
              </div>
            ) : error ? (
              <div className="text-center py-6">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={handleDeepDive}
                  className="mt-3 text-xs text-[#4ea8dd] hover:text-[#4ea8dd]"
                >
                  Try again
                </button>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {/* Summary */}
                {result.summary && (
                  <div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {result.summary}
                    </p>
                  </div>
                )}

                {/* Key Points */}
                {result.keyPoints && result.keyPoints.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                        Key Points
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {result.keyPoints.map((point, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-emerald-400 mt-1.5 flex-shrink-0">•</span>
                          <span className="text-sm text-slate-300 leading-relaxed">
                            {point}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Notable Quotes */}
                {result.notableQuotes && result.notableQuotes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Quote className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                        Notable Quotes
                      </span>
                    </div>
                    <div className="space-y-2">
                      {result.notableQuotes.map((quote, idx) => (
                        <div
                          key={idx}
                          className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg p-3"
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-medium text-slate-400">
                              {quote.timestamp}
                            </span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs font-medium text-slate-400">
                              {quote.speaker}
                            </span>
                          </div>
                          <p className="text-sm text-white italic leading-relaxed">
                            "{quote.quote}"
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Arrow pointer */}
          <div
            className="absolute w-3 h-3 bg-[#2A2A2A] border-r border-b border-[#2A2A2A] transform rotate-45"
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

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2, Quote, Lightbulb, MessageCircle } from 'lucide-react';
import type { TranscriptSegment, TranscriptDeepDiveResult } from '@shared/types';

interface TranscriptDeepDiveProps {
  segment: TranscriptSegment;
  meetingId: string;
  className?: string;
}

export function TranscriptDeepDive({ segment, meetingId, className = '' }: TranscriptDeepDiveProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TranscriptDeepDiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
      const deepDiveResult = await window.kakarot.transcript.deepDive(meetingId, segment.id);
      setResult(deepDiveResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze transcript');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Magnifying Glass Trigger */}
      <button
        ref={triggerRef}
        onClick={handleDeepDive}
        className={`ml-2 p-1 rounded-full transition-all duration-200 ${
          isHovered || isOpen
            ? 'opacity-100 bg-white/10 hover:bg-white/20'
            : 'opacity-0 pointer-events-none'
        }`}
        title="Deep dive into this segment"
      >
        <Search className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute z-50 w-96 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] shadow-2xl"
          style={{
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2A2A]">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-white">Transcript Deep Dive</span>
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
                <p className="text-sm text-slate-400">Analyzing transcript...</p>
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

          {/* Footer with timestamp */}
          {result && !isLoading && (
            <div className="px-4 py-2 border-t border-[#2A2A2A] bg-[#151515] rounded-b-xl">
              <p className="text-xs text-slate-500">
                Timestamp: {Math.floor(result.timestamp / 60000)}:
                {String(Math.floor((result.timestamp % 60000) / 1000)).padStart(2, '0')}
              </p>
            </div>
          )}

          {/* Arrow pointer */}
          <div
            className="absolute w-3 h-3 bg-[#1A1A1A] border-r border-b border-[#2A2A2A] transform rotate-45"
            style={{
              bottom: '-6px',
              left: '50%',
              marginLeft: '-6px',
            }}
          />
        </div>
      )}
    </div>
  );
}

export default TranscriptDeepDive;

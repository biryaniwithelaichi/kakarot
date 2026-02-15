import React, { useState } from 'react';
import { ChevronRight, Brain } from 'lucide-react';

interface ThoughtTraceProps {
  thinking: string;
  thinkingDuration?: number;
  isStreaming?: boolean;
}

/**
 * ThoughtTrace component - Displays collapsible chain-of-thought reasoning
 * Shows "Thought for [X]s" with expandable internal monologue
 */
export default function ThoughtTrace({ thinking, thinkingDuration, isStreaming = false }: ThoughtTraceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 1) return '<1s';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const durationText = thinkingDuration
    ? formatDuration(thinkingDuration)
    : isStreaming ? '...' : '0s';

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-white/50 hover:text-white/70 transition-colors group"
        disabled={!thinking}
      >
        <ChevronRight
          size={14}
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''} ${!thinking ? 'opacity-30' : ''}`}
        />
        <Brain size={14} className={!thinking ? 'opacity-30' : ''} />
        <span className={!thinking ? 'opacity-30' : ''}>
          Thought for {durationText}
        </span>
      </button>

      {isExpanded && thinking && (
        <div className="mt-2 pl-6 pr-2">
          <div className="bg-black/20 rounded-lg p-3 border border-white/5">
            <div
              className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap font-mono"
              style={{ fontSize: '0.8125rem', lineHeight: '1.5' }}
            >
              {thinking}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

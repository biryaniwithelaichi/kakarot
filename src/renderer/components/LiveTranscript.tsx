import React, { useEffect, useRef, useMemo } from 'react';
import type { TranscriptSegment } from '@shared/types';
import { MicOff } from 'lucide-react';
import { formatTimestamp, getSpeakerLabel } from '../lib/formatters';

interface LiveTranscriptProps {
  segments: TranscriptSegment[];
  currentPartials: {
    mic: TranscriptSegment | null;
    system: TranscriptSegment | null;
  };
}

// Time window (ms) within which consecutive segments from same speaker are merged
const MERGE_WINDOW_MS = 8000; // 8 seconds - segments within this gap get combined

interface GroupedSegment {
  id: string;
  source: 'mic' | 'system';
  timestamp: number;
  text: string;
  segmentCount: number;
}

/**
 * Group consecutive segments from the same speaker into single blocks.
 * This reduces visual clutter without losing any transcript content.
 */
function groupSegments(segments: TranscriptSegment[]): GroupedSegment[] {
  if (segments.length === 0) return [];

  const groups: GroupedSegment[] = [];
  let currentGroup: GroupedSegment | null = null;

  for (const segment of segments) {
    const shouldMerge =
      currentGroup &&
      currentGroup.source === segment.source &&
      segment.timestamp - currentGroup.timestamp < MERGE_WINDOW_MS;

    if (shouldMerge && currentGroup) {
      // Append to current group
      currentGroup.text += ' ' + segment.text;
      currentGroup.segmentCount++;
    } else {
      // Start a new group
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = {
        id: segment.id,
        source: segment.source,
        timestamp: segment.timestamp,
        text: segment.text,
        segmentCount: 1,
      };
    }
  }

  // Don't forget the last group
  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

export default function LiveTranscript({ segments, currentPartials }: LiveTranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when segments or partials change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [segments, currentPartials]);

  const hasPartials = currentPartials.mic || currentPartials.system;

  // Group consecutive segments from same speaker to reduce clutter
  const groupedSegments = useMemo(() => groupSegments(segments), [segments]);

  if (segments.length === 0 && !hasPartials) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <MicOff className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Start recording to see live transcription</p>
        </div>
      </div>
    );
  }

  // Collect active partials to render after finals
  const activePartials = [currentPartials.system, currentPartials.mic].filter(
    (p): p is TranscriptSegment => p !== null
  );

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto pr-2 space-y-4"
    >
      {/* Grouped final segments - consecutive same-speaker segments merged */}
      {groupedSegments.map((group) => (
        <div
          key={group.id}
          className={`transcript-segment flex ${
            group.source === 'mic' ? 'justify-end' : 'justify-start'
          }`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              group.source === 'mic'
                ? 'bg-gray-900 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-900 rounded-bl-md border border-gray-200'
            }`}
          >
            <div className="text-xs opacity-70 mb-1">
              {getSpeakerLabel(group.source)} -{' '}
              {formatTimestamp(group.timestamp)}
            </div>
            <p className="text-sm leading-relaxed">{group.text}</p>
          </div>
        </div>
      ))}

      {/* Partial segments - word-level styling (final=solid, non-final=gray) */}
      {activePartials.map((partial) => (
        <div
          key={`partial-${partial.source}`}
          className={`transcript-segment flex ${
            partial.source === 'mic' ? 'justify-end' : 'justify-start'
          }`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              partial.source === 'mic'
                ? 'bg-gray-900 rounded-br-md'
                : 'bg-gray-100 rounded-bl-md border border-gray-200'
            }`}
          >
            <div className={`text-xs opacity-70 mb-1 ${partial.source === 'mic' ? 'text-gray-400' : 'text-gray-500'}`}>
              {getSpeakerLabel(partial.source)} -{' '}
              {formatTimestamp(partial.timestamp)}
            </div>
            <p className="text-sm leading-relaxed">
              {partial.words.map((word, i) => (
                <span
                  key={i}
                  className={
                    word.isFinal
                      ? partial.source === 'mic' ? 'text-white' : 'text-gray-900'
                      : partial.source === 'mic' ? 'text-gray-500' : 'text-gray-400'
                  }
                >
                  {word.text}{' '}
                </span>
              ))}
              <span className={`inline-block w-2 h-4 ml-1 opacity-50 animate-pulse ${partial.source === 'mic' ? 'bg-gray-400' : 'bg-gray-500'}`} />
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

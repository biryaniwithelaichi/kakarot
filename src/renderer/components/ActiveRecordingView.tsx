import React from 'react';
import { useAppStore } from '../stores/appStore';
import AudioLevelMeter from './AudioLevelMeter';
import { Square, Loader2, Users, X, Clock, ChevronDown, Mic, Pause, Play, Trash2 } from 'lucide-react';
import type { TranscriptSegment } from '@shared/types';

// Transcript grouping constants (same as LiveTranscript.tsx)
const MERGE_WINDOW_MS = 45000;
const CONTINUOUS_SPEECH_MS = 2000;

interface GroupedSegment {
  id: string;
  source: 'mic' | 'system';
  timestamp: number;
  text: string;
  segmentCount: number;
}

function endsWithSentence(text: string): boolean {
  return /[.!?]$/.test(text.trim());
}

function groupTranscriptSegments(segments: TranscriptSegment[]): GroupedSegment[] {
  if (segments.length === 0) return [];

  const groups: GroupedSegment[] = [];
  let currentGroup: GroupedSegment | null = null;

  for (const segment of segments) {
    if (!currentGroup) {
      currentGroup = {
        id: segment.id,
        source: segment.source,
        timestamp: segment.timestamp,
        text: segment.text,
        segmentCount: 1,
      };
      continue;
    }

    const timeSinceLast = segment.timestamp - currentGroup.timestamp;
    const isSameSpeaker = currentGroup.source === segment.source;
    const withinTimeWindow = timeSinceLast < MERGE_WINDOW_MS;
    const isContinuousSpeech = timeSinceLast < CONTINUOUS_SPEECH_MS;
    const previousIncomplete = !endsWithSentence(currentGroup.text);
    const shouldMerge = isSameSpeaker && (isContinuousSpeech || withinTimeWindow || previousIncomplete);

    if (shouldMerge) {
      currentGroup.text += ' ' + segment.text;
      currentGroup.segmentCount++;
    } else {
      groups.push(currentGroup);
      currentGroup = {
        id: segment.id,
        source: segment.source,
        timestamp: segment.timestamp,
        text: segment.text,
        segmentCount: 1,
      };
    }
  }

  if (currentGroup) groups.push(currentGroup);
  return groups;
}

interface ActiveRecordingViewProps {
  titleInput: string;
  onTitleChange: (title: string) => void;
  onTitleBlur: () => void;
  isSavingTitle: boolean;
  notes: string;
  onNotesChange: (notes: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDiscard: () => void;
}

export default function ActiveRecordingView({
  titleInput,
  onTitleChange,
  onTitleBlur,
  isSavingTitle,
  notes,
  onNotesChange,
  onPause,
  onResume,
  onStop,
  onDiscard,
}: ActiveRecordingViewProps) {
  const { recordingState, audioLevels, liveTranscript, currentPartials, recordingContext } = useAppStore();
  const isRecording = recordingState === 'recording';
  const isPaused = recordingState === 'paused';

  const [showTranscriptPopover, setShowTranscriptPopover] = React.useState(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = React.useState(true);
  const [showTimePopover, setShowTimePopover] = React.useState(false);
  const [showParticipantsPopover, setShowParticipantsPopover] = React.useState(false);
  const transcriptScrollRef = React.useRef<HTMLDivElement>(null);
  const lastScrollTopRef = React.useRef<number>(0);
  const timeButtonRef = React.useRef<HTMLButtonElement>(null);
  const timePopoverRef = React.useRef<HTMLDivElement>(null);
  const participantsButtonRef = React.useRef<HTMLButtonElement>(null);
  const participantsPopoverRef = React.useRef<HTMLDivElement>(null);

  const displayDate = recordingContext?.start || new Date();
  const displayAttendees: string[] = (
    recordingContext?.attendees?.map((a: any) =>
      typeof a === 'string' ? a : a.email
    ) || []
  );

  // Auto-scroll transcript
  React.useEffect(() => {
    if (isAutoScrollEnabled && transcriptScrollRef.current && showTranscriptPopover) {
      transcriptScrollRef.current.scrollTo({
        top: transcriptScrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [liveTranscript, currentPartials, isAutoScrollEnabled, showTranscriptPopover]);

  // Click-outside handlers for popovers
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        timePopoverRef.current && !timePopoverRef.current.contains(event.target as Node) &&
        timeButtonRef.current && !timeButtonRef.current.contains(event.target as Node)
      ) {
        setShowTimePopover(false);
      }
      if (
        participantsPopoverRef.current && !participantsPopoverRef.current.contains(event.target as Node) &&
        participantsButtonRef.current && !participantsButtonRef.current.contains(event.target as Node)
      ) {
        setShowParticipantsPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div className="relative flex-1 min-h-0 flex flex-col rounded-lg bg-surface border border-edge shadow-elevated p-6 sm:p-7 overflow-hidden animate-modal-in">
        <div className="relative flex-1 min-h-0 flex flex-col">
          {/* Recording Header */}
          <div className="flex-shrink-0 mb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-3 flex-1">
                <input
                  value={titleInput}
                  onChange={(e) => onTitleChange(e.target.value)}
                  onBlur={onTitleBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  className="text-xl font-medium text-cream bg-transparent border-b border-transparent focus:border-accent/40 focus:outline-none truncate max-w-[420px]"
                  style={{ boxShadow: 'none' }}
                  placeholder="Untitled Meeting"
                />
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium bg-accent/10 text-accent border border-accent/15">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent recording-indicator" />
                    <span>{isRecording ? 'Transcribing' : 'Paused'}</span>
                  </div>
                  {isSavingTitle && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
                </div>
              </div>
              {/* Meta chips */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    ref={timeButtonRef}
                    onClick={() => setShowTimePopover(!showTimePopover)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-input border border-edge text-xs text-muted hover:bg-edge-light/20 transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </button>
                  {showTimePopover && (
                    <div
                      ref={timePopoverRef}
                      className="absolute top-full right-0 mt-2 bg-card rounded-lg border border-edge shadow-overlay z-50 overflow-hidden min-w-max animate-popover-in"
                    >
                      <div className="p-3 border-b border-edge flex items-center justify-between">
                        <h3 className="text-sm font-medium text-cream">Meeting time</h3>
                        <button onClick={() => setShowTimePopover(false)} className="p-1 text-muted hover:text-cream transition-colors rounded hover:bg-white/5">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="p-3 space-y-2">
                        <div>
                          <p className="text-[10px] text-dim uppercase font-medium mb-0.5">Date</p>
                          <p className="text-xs text-cream">{displayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-dim uppercase font-medium mb-0.5">Time</p>
                          <p className="text-xs text-cream">{displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {recordingContext && displayAttendees.length > 0 && (
                  <div className="relative">
                    <button
                      ref={participantsButtonRef}
                      onClick={() => setShowParticipantsPopover(!showParticipantsPopover)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-input border border-edge text-xs text-muted hover:bg-edge-light/20 transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{displayAttendees.length}</span>
                    </button>
                    {showParticipantsPopover && (
                      <div
                        ref={participantsPopoverRef}
                        className="absolute top-full right-0 mt-2 bg-card rounded-lg border border-edge shadow-overlay z-50 overflow-hidden min-w-[280px] animate-popover-in"
                      >
                        <div className="p-3 border-b border-edge flex items-center justify-between">
                          <h3 className="text-sm font-medium text-cream">Participants</h3>
                          <button onClick={() => setShowParticipantsPopover(false)} className="p-1 text-muted hover:text-cream transition-colors rounded hover:bg-white/5">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="p-3 max-h-[200px] overflow-y-auto">
                          <div className="space-y-2">
                            {displayAttendees.map((email, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent font-medium text-[10px]">
                                  {email.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-muted truncate">{email}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full Notes Panel */}
          <div className="flex-1 min-h-0 rounded-lg border border-edge bg-card p-6 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <h3 className="text-xs uppercase tracking-[0.15em] font-medium text-muted">Your notes</h3>
                <p className="text-xs text-dim mt-1">Capture action items, decisions, and next steps.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-28">
                  <AudioLevelMeter label="Mic" level={audioLevels.mic} />
                </div>
                <div className="w-28">
                  <AudioLevelMeter label="System" level={audioLevels.system} />
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Take notes during your meeting..."
                className="w-full h-full resize-none bg-transparent text-base text-cream placeholder:text-dim focus:outline-none leading-relaxed overflow-auto"
              />
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="flex-shrink-0 mt-3 flex items-center justify-between gap-2">
            {/* Live Transcription toggle - left side, in normal flow */}
            <button
              onClick={() => setShowTranscriptPopover((open) => !open)}
              className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 shadow-elevated transition-colors ${
                showTranscriptPopover
                  ? 'bg-accent text-surface'
                  : 'bg-card border border-edge text-muted hover:text-cream hover:border-edge-light'
              }`}
              aria-label="Toggle live transcript"
            >
              <Mic className="w-4 h-4" />
              <span className="text-sm font-medium">Live Transcription</span>
            </button>

            <div className="flex items-center gap-2">
              {isPaused && (
                <>
                  <button
                    onClick={onResume}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-input text-cream border border-edge text-xs font-medium hover:bg-edge transition-colors active:scale-[0.96]"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </button>
                  <button
                    onClick={onDiscard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-error/80 text-white text-xs font-medium hover:bg-status-error transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Discard
                  </button>
                </>
              )}
              {isRecording && (
                <button
                  onClick={onPause}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-input text-cream border border-edge text-xs font-medium hover:bg-edge transition-colors active:scale-[0.96]"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              )}
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-status-error/80 text-white text-xs font-medium hover:bg-status-error transition-colors shadow-soft active:scale-[0.96]"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Transcript Popover */}
      {showTranscriptPopover && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[480px] max-h-[450px] rounded-lg border border-edge bg-card shadow-overlay overflow-hidden flex flex-col animate-popover-in-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent recording-indicator" />
                <span className="text-xs font-medium text-muted uppercase tracking-wider">Live transcript</span>
              </div>
            </div>
            <button
              onClick={() => setShowTranscriptPopover(false)}
              className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
              aria-label="Close transcript"
            >
              <X className="w-4 h-4 text-muted" />
            </button>
          </div>

          <div
            ref={transcriptScrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            onScroll={(e) => {
              const target = e.target as HTMLDivElement;
              const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
              if (target.scrollTop < lastScrollTopRef.current && !isAtBottom) {
                setIsAutoScrollEnabled(false);
              }
              if (isAtBottom) {
                setIsAutoScrollEnabled(true);
              }
              lastScrollTopRef.current = target.scrollTop;
            }}
          >
            {liveTranscript.length === 0 && !currentPartials.mic && !currentPartials.system ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mic className="w-8 h-8 text-dim mb-3" />
                <p className="text-sm text-dim">Waiting for speech...</p>
                <p className="text-xs text-dim mt-1">Start talking and the transcript will appear here</p>
              </div>
            ) : (
              <>
                {groupTranscriptSegments(liveTranscript).map((group) => (
                  <div key={group.id} className={`flex ${group.source === 'mic' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                        group.source === 'mic'
                          ? 'bg-accent/15 text-cream border border-accent/10'
                          : 'bg-input text-muted border border-edge'
                      }`}
                    >
                      <p className="leading-relaxed">{group.text}</p>
                    </div>
                  </div>
                ))}
                {currentPartials.system && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg px-4 py-2.5 text-sm opacity-50 bg-input text-muted border border-edge">
                      <p className="leading-relaxed">{currentPartials.system.text}</p>
                    </div>
                  </div>
                )}
                {currentPartials.mic && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-lg px-4 py-2.5 text-sm opacity-50 bg-accent/15 text-cream border border-accent/10">
                      <p className="leading-relaxed">{currentPartials.mic.text}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {!isAutoScrollEnabled && liveTranscript.length > 0 && (
            <button
              onClick={() => {
                setIsAutoScrollEnabled(true);
                transcriptScrollRef.current?.scrollTo({ top: transcriptScrollRef.current.scrollHeight, behavior: 'smooth' });
              }}
              className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-surface text-xs font-medium shadow-elevated hover:bg-accent-hover transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
              New messages
            </button>
          )}

          <div className="flex items-center justify-center gap-6 px-4 py-2.5 border-t border-edge bg-surface flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-edge border border-edge-light"></div>
              <span className="text-xs text-dim">System audio</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accent/20 border border-accent/15"></div>
              <span className="text-xs text-dim">Your mic</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

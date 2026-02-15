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
      <div className="relative flex-1 min-h-0 flex flex-col rounded-2xl bg-gradient-to-br from-[#141414] via-[#0C0C0C] to-[#080808] shadow-[0_20px_70px_rgba(0,0,0,0.65)] p-6 sm:p-7 overflow-hidden border border-[#1E1E1E] animate-modal-in">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(193,127,62,0.08),transparent_45%),radial-gradient(circle_at_bottom,rgba(240,235,227,0.03),transparent_40%)]" />
        <div className="absolute inset-0 pointer-events-none rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.03),inset_0_-1px_20px_rgba(0,0,0,0.45)]" />
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
                  className="text-2xl font-semibold text-white bg-transparent border-b border-transparent focus:border-[#C17F3E] focus:outline-none truncate max-w-[420px]"
                  placeholder="Untitled Meeting"
                />
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-[#C17F3E]/10 text-[#D4923F] border border-[#C17F3E]/20 shadow-[0_0_20px_rgba(193,127,62,0.15)]">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C17F3E] opacity-60"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C17F3E]"></span>
                    </span>
                    <span>{isRecording ? 'Transcribing' : 'Paused'}</span>
                  </div>
                  {isSavingTitle && <Loader2 className="w-4 h-4 animate-spin text-[#C17F3E]" />}
                </div>
              </div>
              {/* Meta chips */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    ref={timeButtonRef}
                    onClick={() => setShowTimePopover(!showTimePopover)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 hover:bg-white/10 transition shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </button>
                  {showTimePopover && (
                    <div
                      ref={timePopoverRef}
                      className="absolute top-full right-0 mt-2 bg-[#0C0C0C] rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden min-w-max animate-popover-in"
                    >
                      <div className="p-3 border-b border-white/10 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">Meeting Time</h3>
                        <button onClick={() => setShowTimePopover(false)} className="p-1 text-slate-400 hover:text-slate-200 transition rounded hover:bg-white/5">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="p-3 space-y-2">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-medium mb-0.5">Date</p>
                          <p className="text-xs text-white">{displayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-medium mb-0.5">Time</p>
                          <p className="text-xs text-white">{displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 hover:bg-white/10 transition shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{displayAttendees.length}</span>
                    </button>
                    {showParticipantsPopover && (
                      <div
                        ref={participantsPopoverRef}
                        className="absolute top-full right-0 mt-2 bg-[#0C0C0C] rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden min-w-[280px] animate-popover-in"
                      >
                        <div className="p-3 border-b border-white/10 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-white">Participants</h3>
                          <button onClick={() => setShowParticipantsPopover(false)} className="p-1 text-slate-400 hover:text-slate-200 transition rounded hover:bg-white/5">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="p-3 max-h-[200px] overflow-y-auto">
                          <div className="space-y-2">
                            {displayAttendees.map((email, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C17F3E] to-[#C17F3E] flex items-center justify-center text-white font-semibold text-[10px]">
                                  {email.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-slate-300 truncate">{email}</span>
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
          <div className="flex-1 min-h-0 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-6 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <h3 className="text-xs uppercase tracking-[0.2em] font-medium text-[#9C9690]">Your Notes</h3>
                <p className="text-xs text-[#5C5750] mt-1">Capture action items, decisions, and next steps.</p>
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
                className="w-full h-full resize-none bg-transparent text-base text-slate-100 placeholder-slate-500 focus:outline-none leading-relaxed overflow-auto"
              />
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="flex-shrink-0 mt-3 flex items-center justify-end gap-2">
            {isPaused && (
              <>
                <button
                  onClick={onResume}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 text-slate-100 border border-white/10 text-xs font-semibold hover:bg-white/15 transition-all duration-200 active:scale-[0.96]"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume
                </button>
                <button
                  onClick={onDiscard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700/80 text-white text-xs font-medium hover:bg-red-600/80 transition"
                >
                  <Trash2 className="w-3 h-3" />
                  Discard
                </button>
              </>
            )}
            {isRecording && (
              <button
                onClick={onPause}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/10 text-slate-100 border border-white/10 text-xs font-semibold hover:bg-white/15 transition-all duration-200 active:scale-[0.96]"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            )}
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600/80 text-white text-xs font-semibold hover:bg-red-600 transition-all duration-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] active:scale-[0.96]"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          </div>

          {/* Live Transcription Capsule */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10">
            <button
              onClick={() => setShowTranscriptPopover((open) => !open)}
              className={`flex items-center gap-2.5 rounded-full px-5 py-3 shadow-2xl transition-all duration-200 active:scale-[0.96] ${
                showTranscriptPopover
                  ? 'bg-[#C17F3E] text-[#0C0C0C] shadow-copper-glow'
                  : 'bg-[#161616] border border-[#2A2A2A] text-[#9C9690] hover:text-[#F0EBE3] hover:border-[#3A3A3A] hover:shadow-elevated'
              }`}
              aria-label="Toggle live transcript"
            >
              <Mic className="w-4 h-4" />
              <span className="text-sm font-medium">Live Transcription</span>
            </button>
          </div>
        </div>
      </div>

      {/* Transcript Popover */}
      {showTranscriptPopover && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[480px] max-h-[450px] rounded-2xl border border-[#2A2A2A] bg-[#0C0C0C] shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-popover-in-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C17F3E] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C17F3E]"></span>
                </span>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Live Transcript</span>
              </div>
            </div>
            <button
              onClick={() => setShowTranscriptPopover(false)}
              className="p-1.5 rounded-lg hover:bg-white/5 transition"
              aria-label="Close transcript"
            >
              <X className="w-4 h-4 text-slate-400" />
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
                <Mic className="w-8 h-8 text-slate-600 mb-3" />
                <p className="text-sm text-slate-500">Waiting for speech...</p>
                <p className="text-xs text-slate-600 mt-1">Start talking and the transcript will appear here</p>
              </div>
            ) : (
              <>
                {groupTranscriptSegments(liveTranscript).map((group) => (
                  <div key={group.id} className={`flex ${group.source === 'mic' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        group.source === 'mic'
                          ? 'bg-[#C17F3E]/20 text-[#F0EBE3] border border-[#C17F3E]/15 rounded-br-md'
                          : 'bg-[#1E1E1E] text-[#9C9690] border border-[#2A2A2A] rounded-bl-md'
                      }`}
                    >
                      <p className="leading-relaxed">{group.text}</p>
                    </div>
                  </div>
                ))}
                {currentPartials.system && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm opacity-50 bg-[#1E1E1E] text-[#9C9690] border border-[#2A2A2A] rounded-bl-md">
                      <p className="leading-relaxed">{currentPartials.system.text}</p>
                    </div>
                  </div>
                )}
                {currentPartials.mic && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm opacity-50 bg-[#C17F3E]/20 text-[#F0EBE3] border border-[#C17F3E]/15 rounded-br-md">
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
              className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-[#C17F3E] text-[#0C0C0C] text-xs font-medium shadow-lg hover:bg-[#D4923F] transition"
            >
              <ChevronDown className="w-4 h-4" />
              New messages
            </button>
          )}

          <div className="flex items-center justify-center gap-6 px-4 py-2.5 border-t border-[#1E1E1E] bg-[#0C0C0C] flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#2A2A2A] border border-[#3A3A3A]"></div>
              <span className="text-xs text-[#5C5750]">System Audio</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#C17F3E]/30 border border-[#C17F3E]/20"></div>
              <span className="text-xs text-[#5C5750]">Your Mic</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

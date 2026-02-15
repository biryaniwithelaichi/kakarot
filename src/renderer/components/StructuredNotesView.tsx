import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Search, CheckCircle2, AlertCircle, User, X, Loader2, Quote, Lightbulb } from 'lucide-react';
import type { GeneratedStructuredNotes, EnhancedDeepDiveResult } from '@shared/types';
import { formatTimestamp, getSpeakerLabel } from '../lib/formatters';
import { usePopoverPosition } from '../lib/popoverUtils';

interface StructuredNotesViewProps {
  notes: GeneratedStructuredNotes;
  meetingId: string;
}

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  badge?: number;
}

function CollapsibleSection({ title, children, defaultOpen = true, icon, badge }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-200 dark:border-[#2A2A2A] last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 py-3 px-1 text-left hover:bg-[#1E1E1E] dark:hover:bg-[#2A2A2A]/50 transition-colors rounded-lg group"
      >
        <span className="text-slate-500 dark:text-slate-400 transition-transform duration-200">
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>
        {icon && <span className="text-slate-500 dark:text-slate-400">{icon}</span>}
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex-1">{title}</span>
        {badge !== undefined && badge > 0 && (
          <span className="text-xs bg-[#2A2A2A] dark:bg-[#2A2A2A] text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="pb-4 pl-6">{children}</div>
      </div>
    </div>
  );
}

interface BulletItemProps {
  text: string;
  subBullets?: string[];
  meetingId: string;
}

function BulletItem({ text, subBullets, meetingId }: BulletItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<EnhancedDeepDiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const popoverPosition = usePopoverPosition(isOpen, triggerRef, 480, 450, 'above');

  const hasSubBullets = subBullets && subBullets.length > 0;

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

  const handleDeepDive = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    setIsLoading(true);
    setError(null);

    try {
      const deepDiveResult = await window.kakarot.notes.enhancedDeepDive(meetingId, text);
      setResult(deepDiveResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze note');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative group">
      <div
        className="flex items-start gap-2 py-1.5 cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => hasSubBullets && setIsExpanded(!isExpanded)}
      >
        {hasSubBullets ? (
          <span className="text-slate-500 dark:text-slate-500 mt-0.5 flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        ) : (
          <span className="text-slate-500 dark:text-slate-500 mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-[#2A2A2A]" />
        )}
        <span className="text-lg text-slate-800 dark:text-slate-200 flex-1 leading-relaxed">{text}</span>

        {/* Deep dive button */}
        {text.length > 15 && (
          <button
            ref={triggerRef}
            onClick={handleDeepDive}
            disabled={isLoading}
            className={`flex-shrink-0 p-1 rounded-full transition-all duration-200 ${
              isHovered || isOpen
                ? 'opacity-100 bg-[#C17F3E]/20 dark:bg-[#C17F3E]/20 hover:bg-[#C17F3E]/30 dark:hover:bg-[#C17F3E]/30'
                : 'opacity-0 pointer-events-none'
            }`}
            title="Deep Dive"
          >
            <Search className={`w-3.5 h-3.5 text-[#C17F3E] dark:text-[#C17F3E] ${isLoading ? 'animate-pulse' : ''}`} />
          </button>
        )}
      </div>

      {/* Enhanced Deep Dive Popover */}
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
              <Search className="w-4 h-4 text-[#C17F3E]" />
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
                <Loader2 className="w-8 h-8 text-[#C17F3E] animate-spin mb-3" />
                <p className="text-sm text-slate-400">Analyzing transcript...</p>
              </div>
            ) : error ? (
              <div className="text-center py-6">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={handleDeepDive}
                  className="mt-3 text-xs text-[#C17F3E] hover:text-[#C17F3E]"
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

      {/* Sub-bullets */}
      {hasSubBullets && isExpanded && (
        <div className="ml-4 border-l border-slate-200 dark:border-[#2A2A2A] pl-3">
          {subBullets.map((subBullet, idx) => (
            <div key={idx} className="flex items-start gap-2 py-1">
              <span className="text-slate-400 dark:text-slate-600 mt-1.5 flex-shrink-0 w-1 h-1 rounded-full bg-slate-300 dark:bg-[#C17F3E]" />
              <span className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{subBullet}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StructuredNotesView({ notes, meetingId }: StructuredNotesViewProps) {
  // Handle case where notes is empty or malformed
  if (!notes || (!notes.topics?.length && !notes.decisions?.length && !notes.actionItems?.length)) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Topics */}
      {notes.topics?.map((topic, topicIdx) => (
        <CollapsibleSection
          key={topicIdx}
          title={topic.title}
          defaultOpen={true}
          badge={topic.bullets?.length}
        >
          <div className="space-y-1">
            {topic.bullets?.map((bullet, bulletIdx) => (
              <BulletItem
                key={bulletIdx}
                text={bullet.text}
                subBullets={bullet.subBullets}
                meetingId={meetingId}
              />
            ))}
          </div>
        </CollapsibleSection>
      ))}

      {/* Decisions */}
      {notes.decisions && notes.decisions.length > 0 && (
        <CollapsibleSection
          title="Decisions"
          defaultOpen={true}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />}
          badge={notes.decisions.length}
        >
          <div className="space-y-3">
            {notes.decisions.map((decision, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 dark:text-emerald-400 mt-1 flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-sm text-slate-800 dark:text-slate-200 font-medium">{decision.text}</span>
                </div>
                {decision.rationale && decision.rationale.length > 0 && (
                  <div className="ml-5 pl-3 border-l border-slate-200 dark:border-[#2A2A2A]">
                    <div className="text-xs text-slate-500 dark:text-slate-500 mb-1">Why:</div>
                    {decision.rationale.map((reason, reasonIdx) => (
                      <div key={reasonIdx} className="flex items-start gap-2 py-0.5">
                        <span className="text-slate-400 dark:text-slate-600 mt-1.5 w-1 h-1 rounded-full bg-slate-300 dark:bg-[#C17F3E] flex-shrink-0" />
                        <span className="text-sm text-slate-600 dark:text-slate-400">{reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Action Items */}
      {notes.actionItems && notes.actionItems.length > 0 && (
        <CollapsibleSection
          title="Action Items"
          defaultOpen={true}
          icon={<User className="w-4 h-4 text-blue-500 dark:text-blue-400" />}
          badge={notes.actionItems.length}
        >
          <div className="space-y-2">
            {notes.actionItems.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 py-2 px-3 bg-[#1E1E1E] dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2A2A2A] rounded-lg"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 dark:text-slate-200">{item.task}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">{item.owner}</span>
                    {item.when && item.when !== 'Not specified' && (
                      <>
                        <span className="text-slate-400 dark:text-slate-600">•</span>
                        <span className="text-xs text-slate-500 dark:text-slate-500">{item.when}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Risks */}
      {notes.risks && notes.risks.length > 0 && (
        <CollapsibleSection
          title="Risks & Open Questions"
          defaultOpen={true}
          icon={<AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400" />}
          badge={notes.risks.length}
        >
          <div className="space-y-2">
            {notes.risks.map((risk, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 py-2 px-3 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-lg"
              >
                <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm text-slate-800 dark:text-slate-200">{risk.text}</div>
                  {(risk.owner || risk.nextSteps) && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-500">
                      {risk.owner && risk.owner !== 'TBD' && (
                        <span>Owner: {risk.owner}</span>
                      )}
                      {risk.nextSteps && risk.nextSteps !== 'Not specified' && (
                        <>
                          {risk.owner && risk.owner !== 'TBD' && <span>•</span>}
                          <span>{risk.nextSteps}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

export default StructuredNotesView;

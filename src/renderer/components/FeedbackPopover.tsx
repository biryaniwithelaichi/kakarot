import React, { useRef, useEffect } from 'react';
import { MessageCircle, MessageSquare } from 'lucide-react';

interface FeedbackPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMessage: () => void;
  onSelectFeedback: () => void;
  anchorEl: HTMLElement | null;
}

export default function FeedbackPopover({
  isOpen,
  onClose,
  onSelectMessage,
  onSelectFeedback,
  anchorEl,
}: FeedbackPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorEl]);

  if (!isOpen || !anchorEl) return null;

  // Position the popover to the right of the anchor element
  const rect = anchorEl.getBoundingClientRect();
  const style = {
    position: 'fixed' as const,
    left: `${rect.right + 8}px`,
    bottom: `${window.innerHeight - rect.bottom}px`,
  };

  return (
    <div
      ref={popoverRef}
      style={style}
      className="z-50 w-56 bg-[#161616] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-popover-in-up"
    >
      <div className="py-1">
        <button
          onClick={() => {
            onSelectMessage();
            onClose();
          }}
          className="w-full px-4 py-3 flex items-center gap-3 text-left text-slate-200 hover:bg-white/5 transition"
        >
          <MessageCircle className="w-4 h-4 text-[#C17F3E]" />
          <span className="text-sm font-medium">Leave a Message</span>
        </button>
        <button
          onClick={() => {
            onSelectFeedback();
            onClose();
          }}
          className="w-full px-4 py-3 flex items-center gap-3 text-left text-slate-200 hover:bg-white/5 transition"
        >
          <MessageSquare className="w-4 h-4 text-[#C17F3E]" />
          <span className="text-sm font-medium">Give Feedback</span>
        </button>
      </div>
    </div>
  );
}

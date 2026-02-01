import React, { useEffect, useState } from 'react';
import type { Callout } from '@shared/types';
import { Lightbulb, X } from 'lucide-react';

export default function CalloutOverlay() {
  const [callout, setCallout] = useState<Callout | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    const unsubscribe = window.kakarot.callout.onShow((newCallout) => {
      setCallout(newCallout);
      setIsVisible(true);
      // Trigger shake animation
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    });

    return () => unsubscribe();
  }, []);

  const handleDismiss = async () => {
    if (callout) {
      await window.kakarot.callout.dismiss(callout.id);
    }
    setIsVisible(false);
    setCallout(null);
  };

  if (!isVisible || !callout) {
    return null;
  }

  return (
    <div className="p-3 h-full flex flex-col">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) scale(1); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-6px) scale(1.02); }
          20%, 40%, 60%, 80% { transform: translateX(6px) scale(1.02); }
        }
        .animate-shake { animation: shake 0.6s ease-in-out !important; }
      `}</style>
      <div className={`bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 flex flex-col flex-1 overflow-hidden ${isShaking ? 'animate-shake' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#4ea8dd]/20 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            <span className="text-xs font-medium text-gray-300">Question Detected</span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="px-4 py-3 flex-1 overflow-y-auto">
          {/* Question */}
          <p className="text-xs text-gray-400 mb-1">Question:</p>
          <p className="text-sm text-white mb-3">{callout.question}</p>

          {/* Suggested response */}
          <p className="text-xs text-gray-400 mb-1">Suggested Response:</p>
          <p className="text-sm text-green-300 leading-relaxed">
            {callout.suggestedResponse}
          </p>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-700">
          <button
            onClick={handleDismiss}
            className="w-full text-xs text-gray-400 hover:text-white transition-colors"
          >
            Click to dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

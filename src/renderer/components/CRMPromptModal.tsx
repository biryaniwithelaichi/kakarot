import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface CRMPromptModalProps {
  meetingId: string;
  provider: 'salesforce' | 'hubspot';
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function CRMPromptModal({ meetingId, provider, onConfirm, onDismiss }: CRMPromptModalProps) {
  const [isPushing, setIsPushing] = useState(false);
  const providerName = provider === 'salesforce' ? 'Salesforce' : 'HubSpot';

  const handleConfirm = async () => {
    setIsPushing(true);
    try {
      await window.kakarot.crm.pushNotes(meetingId);
      console.log('[CRMPromptModal] Notes pushed to CRM:', provider);
      onConfirm();
    } catch (err) {
      console.error('[CRMPromptModal] Failed to push notes to CRM:', err);
      onDismiss();
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-backdrop-in">
      <div className="bg-[#161616] rounded-xl shadow-lg max-w-sm w-full border border-[#2A2A2A] animate-modal-in">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Send to {providerName}?
            </h3>
            <button
              onClick={onDismiss}
              disabled={isPushing}
              className="text-slate-500 hover:text-slate-400 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-slate-300 mb-6">
            Would you like to send these meeting notes to {providerName}?
            {provider === 'salesforce'
              ? ' Notes will be added as tasks.'
              : ' Notes will be created as contact notes.'}
          </p>

          <div className="flex gap-3">
            <button
              onClick={onDismiss}
              disabled={isPushing}
              className="flex-1 px-4 py-2 rounded-lg border border-[#2A2A2A] text-slate-200 font-medium hover:bg-[#2A2A2A]/50 disabled:opacity-50 transition"
            >
              No
            </button>
            <button
              onClick={handleConfirm}
              disabled={isPushing}
              className="flex-1 px-4 py-2 rounded-lg bg-[#C17F3E] text-[#0C0C0C] font-medium hover:bg-[#D4923F] disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {isPushing && <Loader2 className="w-4 h-4 animate-spin" />}
              Yes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

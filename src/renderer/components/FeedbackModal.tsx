import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'message' | 'feedback';
}

export default function FeedbackModal({ isOpen, onClose, mode }: FeedbackModalProps) {
  const { settings } = useAppStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Pre-fill from user profile if available
  useEffect(() => {
    if (isOpen) {
      setName(settings?.userProfile?.name || '');
      setEmail(settings?.userProfile?.email || '');
      setMessage('');
      setSubmitStatus('idle');
    }
  }, [isOpen, settings?.userProfile, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      // TODO: Implement actual feedback submission endpoint
      // For now, we'll just simulate an API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Feedback submitted:', {
        type: mode,
        name,
        email,
        message,
        timestamp: new Date().toISOString(),
      });

      setSubmitStatus('success');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const title = mode === 'message' ? 'Leave a Message' : 'Give Feedback';
  const isFormValid = name.trim() && email.trim() && message.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
      <div className="bg-[#161616] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1.5">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-3 py-2 bg-[#0C0C0C] border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#C17F3E]/50 focus:border-[#C17F3E]"
              required
            />
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full px-3 py-2 bg-[#0C0C0C] border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#C17F3E]/50 focus:border-[#C17F3E]"
              required
            />
          </div>

          {/* Message Field */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-1.5">
              {mode === 'message' ? 'Message' : 'Feedback'}
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={mode === 'message' ? 'Share your thoughts...' : 'Tell us what you think...'}
              rows={5}
              className="w-full px-3 py-2 bg-[#0C0C0C] border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#C17F3E]/50 focus:border-[#C17F3E] resize-none"
              required
            />
          </div>

          {/* Submit Status */}
          {submitStatus === 'success' && (
            <div className="text-[#F0EBE3] text-sm">
              Thank you! Your {mode === 'message' ? 'message' : 'feedback'} has been sent.
            </div>
          )}
          {submitStatus === 'error' && (
            <div className="text-red-400 text-sm">
              Failed to send. Please try again.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className={`flex-1 px-4 py-2 rounded-lg transition ${
                isFormValid && !isSubmitting
                  ? 'bg-[#C17F3E] hover:bg-[#C17F3E]/90 text-white'
                  : 'bg-white/5 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

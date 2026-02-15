import { useRef, useEffect } from 'react';
import { Share2, Copy, Link, Mail, Check } from 'lucide-react';
import type { Meeting } from '@shared/types';
import { useShareMeeting } from '../hooks/useShareMeeting';
import slackLogo from '../assets/slack.png';

interface SharePopoverProps {
  meeting: Meeting;
}

export default function SharePopover({ meeting }: SharePopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    showSharePopover,
    setShowSharePopover,
    shareCopied,
    handleCopyShareLink,
    handleCopyText,
    handleEmailParticipants,
    handleSlackConnect,
    handleSlackSend,
    slackChannels,
    slackChannelId,
    setSlackChannelId,
    isSlackConnecting,
    isSlackSending,
    showSlackOptions,
  } = useShareMeeting(meeting);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSharePopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setShowSharePopover]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setShowSharePopover(!showSharePopover)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2A2A2A] bg-[#161616] text-sm font-medium text-slate-200 hover:bg-[#2A2A2A] transition"
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>
      {showSharePopover && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-[#2A2A2A] bg-[#161616] shadow-2xl p-3 space-y-2 animate-popover-in z-50">
          <p className="text-xs text-slate-400">Share your meeting notes</p>
          <button
            onClick={handleCopyShareLink}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#1E1E1E] hover:bg-[#2A2A2A] text-sm text-slate-100 transition"
          >
            {shareCopied ? <Check className="w-4 h-4 text-slate-400" /> : <Link className="w-4 h-4 text-slate-400" />}
            <span>{shareCopied ? 'Copied!' : 'Copy share link'}</span>
          </button>
          <button
            onClick={handleCopyText}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#1E1E1E] hover:bg-[#2A2A2A] text-sm text-slate-100 transition"
          >
            <Copy className="w-4 h-4 text-slate-400" />
            <span>Copy Text</span>
          </button>
          <button
            onClick={handleEmailParticipants}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#1E1E1E] hover:bg-[#2A2A2A] text-sm text-slate-100 transition"
          >
            <Mail className="w-4 h-4 text-slate-400" />
            <span>Email Participants</span>
          </button>
          <button
            onClick={handleSlackConnect}
            disabled={isSlackConnecting}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#1E1E1E] hover:bg-[#2A2A2A] text-sm text-slate-100 transition disabled:opacity-50"
          >
            <img src={slackLogo} alt="Slack" className="w-4 h-4" />
            <span>{isSlackConnecting ? 'Connecting...' : 'Send to Slack'}</span>
          </button>
          {showSlackOptions && (
            <div className="pt-2 border-t border-[#2A2A2A] space-y-2">
              <select
                value={slackChannelId}
                onChange={(e) => setSlackChannelId(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-md bg-[#1E1E1E] border border-[#2A2A2A] text-slate-100"
              >
                <option value="">Select channel...</option>
                {slackChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.isPrivate ? '#' : '#'} {channel.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSlackSend}
                disabled={!slackChannelId || isSlackSending}
                className="w-full px-3 py-1.5 rounded-md bg-[#4ea8dd] hover:bg-[#3d96cb] text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSlackSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

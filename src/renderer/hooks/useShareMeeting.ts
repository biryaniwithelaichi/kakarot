import { useState, useCallback } from 'react';
import type { Meeting } from '@shared/types';
import { toast } from '../stores/toastStore';

interface UseShareMeetingReturn {
  showSharePopover: boolean;
  setShowSharePopover: (open: boolean) => void;
  shareCopied: boolean;
  handleCopyShareLink: () => Promise<void>;
  handleCopyText: () => Promise<void>;
  handleEmailParticipants: () => void;
  // Slack
  handleSlackConnect: () => Promise<void>;
  handleSlackSend: () => Promise<void>;
  slackChannels: Array<{ id: string; name: string; isPrivate?: boolean }>;
  slackChannelId: string;
  setSlackChannelId: (id: string) => void;
  isSlackConnecting: boolean;
  isSlackSending: boolean;
  showSlackOptions: boolean;
}

export function useShareMeeting(meeting: Meeting | null): UseShareMeetingReturn {
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Slack state
  const [slackToken, setSlackToken] = useState<string | null>(null);
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string; isPrivate?: boolean }>>([]);
  const [slackChannelId, setSlackChannelId] = useState('');
  const [isSlackConnecting, setIsSlackConnecting] = useState(false);
  const [isSlackSending, setIsSlackSending] = useState(false);
  const [showSlackOptions, setShowSlackOptions] = useState(false);

  const shareLink = meeting ? `kakarot://meeting/${meeting.id}` : '';

  const handleCopyShareLink = useCallback(async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy share link', err);
    }
  }, [shareLink]);

  const handleCopyText = useCallback(async () => {
    if (!meeting) return;
    const text = `${meeting.title}\n${meeting.overview || ''}\n${meeting.notesMarkdown || meeting.summary || ''}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
      setShowSharePopover(false);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  }, [meeting]);

  const handleEmailParticipants = useCallback(() => {
    if (!meeting) return;
    const participants = meeting.attendeeEmails || meeting.participants || [];
    const emailList = participants.join(';');
    const subject = encodeURIComponent(`Meeting Notes: ${meeting.title}`);
    const body = encodeURIComponent(
      `${meeting.title}\n\n${meeting.overview || meeting.notesMarkdown || meeting.summary || 'See attached notes.'}`
    );
    window.location.href = `mailto:${emailList}?subject=${subject}&body=${body}`;
    setShowSharePopover(false);
  }, [meeting]);

  const handleSlackConnect = useCallback(async () => {
    if (!meeting) return;

    if (!slackToken) {
      try {
        setIsSlackConnecting(true);
        const result = await window.kakarot.slack.connect();
        setSlackToken(result.accessToken);
        const channelList = await window.kakarot.slack.getChannels(result.accessToken);
        setSlackChannels(channelList);
        setShowSlackOptions(true);
      } catch (err) {
        console.error('Failed to connect to Slack:', err);
        toast.error('Failed to connect to Slack');
      } finally {
        setIsSlackConnecting(false);
      }
    } else {
      setShowSlackOptions(true);
    }
  }, [meeting, slackToken]);

  const handleSlackSend = useCallback(async () => {
    if (!slackToken || !slackChannelId || !meeting) return;

    setIsSlackSending(true);
    try {
      const notesContent = meeting.notesMarkdown || meeting.overview || 'Meeting notes';
      await window.kakarot.slack.sendNote(
        slackToken,
        slackChannelId,
        `*${meeting.title}*\n\n${notesContent}`
      );
      toast.success('Notes sent to Slack!');
      setShowSlackOptions(false);
      setShowSharePopover(false);
    } catch (err) {
      console.error('Failed to send to Slack:', err);
      toast.error('Failed to send notes to Slack');
    } finally {
      setIsSlackSending(false);
    }
  }, [slackToken, slackChannelId, meeting]);

  return {
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
  };
}

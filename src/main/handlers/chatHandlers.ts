import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';
import type { Meeting } from '@shared/types';

const logger = createLogger('ChatHandlers');

// Format meeting data for AI context (smart selection based on query)
function formatMeetingsForAI(meetings: Meeting[], userQuery: string): string {
  if (meetings.length === 0) {
    return "No meetings found in your history.";
  }

  // Sort meetings by date (most recent first)
  const sortedMeetings = meetings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let selectedMeetings: Meeting[] = [];

  const queryLower = userQuery.toLowerCase();

  // Check if user is asking about a specific meeting by title
  const meetingTitles = meetings.map(m => m.title.toLowerCase());
  const mentionedTitles = meetingTitles.filter(title =>
    queryLower.includes(title) ||
    title.split(' ').some(word => word.length > 3 && queryLower.includes(word))
  );

  if (mentionedTitles.length > 0) {
    // If specific meetings are mentioned, include those plus some context
    const relevantMeetings = meetings.filter(m =>
      mentionedTitles.includes(m.title.toLowerCase())
    );
    // Add the mentioned meetings plus up to 3 more recent ones for context
    selectedMeetings = [...relevantMeetings, ...sortedMeetings.slice(0, 3)].filter((m, index, arr) =>
      arr.findIndex(other => other.id === m.id) === index // Remove duplicates
    ).slice(0, 6); // Limit to 6 total
  }
  // Check for date-specific queries
  else if (queryLower.includes('january') || queryLower.includes('february') || queryLower.includes('march') ||
      queryLower.includes('april') || queryLower.includes('may') || queryLower.includes('june') ||
      queryLower.includes('july') || queryLower.includes('august') || queryLower.includes('september') ||
      queryLower.includes('october') || queryLower.includes('november') || queryLower.includes('december') ||
      queryLower.includes('today') || queryLower.includes('yesterday') || queryLower.includes('last week') ||
      queryLower.includes('this week') || queryLower.includes('this month')) {
    // For date queries, include more meetings
    selectedMeetings = sortedMeetings.slice(0, 12);
  }
  // Check for people-specific queries
  else if (queryLower.includes('met with') || queryLower.includes('meeting with') ||
           queryLower.includes('who did i meet') || queryLower.includes('attendees') ||
           queryLower.includes('participants')) {
    selectedMeetings = sortedMeetings.slice(0, 8);
  }
  // Default: only recent meetings
  else {
    selectedMeetings = sortedMeetings.slice(0, 3);
  }

  const formattedMeetings = selectedMeetings.map((meeting, index) => {
    const date = new Date(meeting.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    let meetingText = `MEETING ${index + 1}:
${meeting.title} (${date})
Attendees: ${meeting.attendeeEmails.slice(0, 2).join(', ')}${meeting.attendeeEmails.length > 2 ? ` +${meeting.attendeeEmails.length - 2}` : ''}

`;

    // Only include summary if it's short
    if (meeting.summary && meeting.summary.length <= 150) {
      meetingText += `Summary: ${meeting.summary}\n\n`;
    }

    // Only include first 2 action items
    if (meeting.actionItems && meeting.actionItems.length > 0) {
      const limitedActionItems = meeting.actionItems.slice(0, 2);
      meetingText += `Action Items: ${limitedActionItems.join(', ')}\n\n`;
    }

    return meetingText;
  });

  const totalMeetings = meetings.length;
  const shownMeetings = selectedMeetings.length;

  return `YOUR RECENT MEETINGS (${shownMeetings} of ${totalMeetings} total):\n\n${formattedMeetings.join('')}`;
}

export function registerChatHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CHAT_SEND_MESSAGE, async (_event, message: string, _context?: unknown) => {
    try {
      const { aiProvider, meetingRepo } = getContainer();

      if (!aiProvider) {
        throw new Error('AI provider not available');
      }

      // Get all meetings for context
      const allMeetings = meetingRepo.findAll();
      const meetingsContext = formatMeetingsForAI(allMeetings, message);

      // Concise system prompt for meeting history agent
      const systemMessage = `You are Kakarot's Meeting History Agent. Help users analyze their meeting history.

CAPABILITIES:
- Answer questions about meetings, attendees, dates
- Provide action items and follow-ups
- Summarize meeting content

GUIDELINES:
- Be concise and helpful
- Reference meetings by title and date
- If info unavailable, say so clearly
- Focus on user's question

${meetingsContext}

Question: ${message}`;

      const response = await aiProvider.chat([
        { role: 'system', content: systemMessage },
        { role: 'user', content: message }
      ]);

      logger.debug('Chat message processed', {
        messageLength: message.length,
        meetingsCount: allMeetings.length
      });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Chat message failed', { error: errorMessage });
      throw error;
    }
  });

  logger.info('Chat handlers registered');
}
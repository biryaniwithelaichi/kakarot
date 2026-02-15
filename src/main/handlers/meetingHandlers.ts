import { ipcMain, desktopCapturer } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { getContainer } from '../core/container';
import { ExportService } from '../services/ExportService';
import { createLogger } from '../core/logger';

const logger = createLogger('MeetingHandlers');

export function registerMeetingHandlers(): void {
  const { meetingRepo, calloutService } = getContainer();
  const exportService = new ExportService();

  ipcMain.handle(IPC_CHANNELS.MEETINGS_LIST, () => {
    return meetingRepo.findAll();
  });

  ipcMain.handle(IPC_CHANNELS.MEETINGS_GET, (_, id: string) => {
    return meetingRepo.findById(id);
  });

  ipcMain.handle(IPC_CHANNELS.MEETINGS_DELETE, (_, id: string) => {
    return meetingRepo.delete(id);
  });

  ipcMain.handle(IPC_CHANNELS.MEETINGS_SEARCH, (_, query: string) => {
    return meetingRepo.search(query);
  });

  ipcMain.handle(
    IPC_CHANNELS.MEETINGS_CREATE_DISMISSED,
    (_, title: string, attendeeEmails?: string[]) => {
      logger.info('Creating dismissed meeting', { title, attendeeEmails });
      try {
        const meetingId = meetingRepo.startNewMeeting(title, attendeeEmails);
        logger.info('Started new meeting', { meetingId });
        // Immediately end it to mark as completed
        const meeting = meetingRepo.endCurrentMeeting();
        logger.info('Ended meeting immediately', { meetingId, meeting });
        return meetingId;
      } catch (error) {
        logger.error('Failed to create dismissed meeting', { error, title, attendeeEmails });
        throw error;
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.MEETING_UPDATE_TITLE, (_, id: string, title: string) => {
    meetingRepo.updateTitle(id, title);
    return meetingRepo.findById(id);
  });

  ipcMain.handle(IPC_CHANNELS.MEETINGS_UPDATE_ATTENDEES, (_, id: string, attendeeEmails: string[]) => {
    logger.info('Updating meeting attendees', { id, attendeeEmails });
    const meeting = meetingRepo.findById(id);
    if (!meeting) {
      throw new Error('Meeting not found');
    }
    meetingRepo.updateAttendees(id, attendeeEmails);
    return meetingRepo.findById(id);
  });

  ipcMain.handle(IPC_CHANNELS.MEETING_SUMMARIZE, async (_, id: string) => {
    const meeting = meetingRepo.findById(id);
    if (!meeting) throw new Error('Meeting not found');

    const summary = await calloutService.generateSummary(meeting);
    meetingRepo.updateSummary(id, summary);
    return summary;
  });

  ipcMain.handle(
    IPC_CHANNELS.MEETING_EXPORT,
    async (_, id: string, format: 'markdown' | 'pdf') => {
      const meeting = meetingRepo.findById(id);
      if (!meeting) throw new Error('Meeting not found');

      return exportService.exportMeeting(meeting, format);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.MEETING_ASK_NOTES,
    async (_, meetingId: string, query: string) => {
      const { aiProvider } = getContainer();
      if (!aiProvider) {
        throw new Error('AI provider not configured');
      }

      const meeting = meetingRepo.findById(meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      // Build context for the AI
      const transcript = meeting.transcript.map((s) => `${s.source === 'mic' ? 'You' : 'Other'}: ${s.text}`).join('\n');
      const notes = meeting.notesMarkdown || meeting.overview || '';

      const prompt = `You are a helpful meeting assistant. The user is asking about their meeting notes.

Meeting Title: ${meeting.title}
Date: ${new Date(meeting.createdAt).toLocaleString()}

Generated Notes:
${notes}

Full Transcript:
${transcript}

User Question: ${query}

Provide a concise, helpful answer based on the meeting notes and transcript.`;

      const response = await aiProvider.complete(prompt, 'gpt-4o');
      return response;
    }
  );

  // Transcript Deep Dive - analyze a specific segment with surrounding context
  ipcMain.handle(
    IPC_CHANNELS.TRANSCRIPT_DEEP_DIVE,
    async (_, meetingId: string, segmentId: string) => {
      const { aiProvider, meetingRepo } = getContainer();
      if (!aiProvider) {
        throw new Error('AI provider not configured');
      }

      const meeting = meetingRepo.findById(meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      // Find the target segment
      const segmentIndex = meeting.transcript.findIndex((s) => s.id === segmentId);
      if (segmentIndex === -1) {
        throw new Error('Transcript segment not found');
      }

      const targetSegment = meeting.transcript[segmentIndex];

      // Get surrounding context (2 minutes before and after, roughly)
      const contextWindowMs = 120000; // 2 minutes
      const startTime = Math.max(0, targetSegment.timestamp - contextWindowMs);
      const endTime = targetSegment.timestamp + contextWindowMs;

      // Extract segments within the context window
      const contextSegments = meeting.transcript.filter(
        (s) => s.timestamp >= startTime && s.timestamp <= endTime
      );

      // Format the transcript chunk for the AI
      const transcriptChunk = contextSegments
        .map((s) => {
          const speaker = s.source === 'mic' ? 'You' : 'Other';
          const minutes = Math.floor(s.timestamp / 60000);
          const seconds = Math.floor((s.timestamp % 60000) / 1000);
          const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          const marker = s.id === segmentId ? ' [TARGET SEGMENT]' : '';
          return `[${timeStr}] ${speaker}: ${s.text}${marker}`;
        })
        .join('\n');

      const prompt = `You are analyzing a specific moment in a meeting transcript. The user wants to understand the context, exact quote, and implications of a particular segment.

Meeting Title: ${meeting.title}
Meeting Date: ${new Date(meeting.createdAt).toLocaleString()}

TRANSCRIPT SEGMENT (with ~2 minutes of surrounding context):
${transcriptChunk}

The segment marked with [TARGET SEGMENT] is what the user wants to understand deeply.

Analyze this transcript segment and generate a 3-part explanation in JSON format:

{
  "context": "A brief narrative (2-3 sentences) explaining what was being discussed at this moment in the meeting. Set the scene for the reader.",
  "verbatimQuote": "The exact words from the target segment, cleaned up for readability but keeping the original meaning. This should be the key quote.",
  "implication": "A closing sentence (1-2 sentences) explaining the result, next step, or significance of what was said. What does this mean for the conversation?"
}

Return ONLY the JSON object, no additional text or markdown.`;

      try {
        const response = await aiProvider.complete(prompt, 'gpt-4o');

        // Parse the JSON response
        const parsed = JSON.parse(response.trim());

        return {
          context: parsed.context || '',
          verbatimQuote: parsed.verbatimQuote || targetSegment.text,
          implication: parsed.implication || '',
          segmentId: segmentId,
          timestamp: targetSegment.timestamp,
        };
      } catch (parseError) {
        logger.error('Failed to parse deep dive response', { parseError, meetingId, segmentId });
        // Return a fallback with the raw segment
        return {
          context: 'Unable to generate context analysis.',
          verbatimQuote: targetSegment.text,
          implication: 'Analysis unavailable.',
          segmentId: segmentId,
          timestamp: targetSegment.timestamp,
        };
      }
    }
  );

  // Notes Deep Dive - analyze a note/bullet point by finding relevant transcript context
  ipcMain.handle(
    IPC_CHANNELS.NOTES_DEEP_DIVE,
    async (_, meetingId: string, noteContent: string) => {
      const { aiProvider, meetingRepo } = getContainer();

      console.log('=== DEEP DIVE START ===');
      console.log('Meeting ID:', meetingId);
      console.log('Note Content:', noteContent);

      if (!aiProvider) {
        console.log('ERROR: AI provider not configured');
        throw new Error('AI provider not configured');
      }

      const meeting = meetingRepo.findById(meetingId);
      if (!meeting) {
        console.log('ERROR: Meeting not found');
        throw new Error('Meeting not found');
      }

      console.log('Meeting found:', meeting.title);
      console.log('Transcript segments:', meeting.transcript?.length || 0);

      // Handle empty transcript
      if (!meeting.transcript || meeting.transcript.length === 0) {
        console.log('ERROR: No transcript available');
        return {
          context: 'No transcript available for this meeting.',
          verbatimQuote: noteContent,
          implication: 'Unable to find source in transcript.',
          noteContent: noteContent,
        };
      }

      // Format the full transcript for context
      const fullTranscript = meeting.transcript
        .map((s) => {
          const speaker = s.source === 'mic' ? 'You' : 'Other';
          const minutes = Math.floor(s.timestamp / 60000);
          const seconds = Math.floor((s.timestamp % 60000) / 1000);
          const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          return `[${timeStr}] ${speaker}: ${s.text}`;
        })
        .join('\n');

      console.log('DEEP DIVE INPUT (transcript length):', fullTranscript.length, 'chars');

      const prompt = `You are analyzing a specific note/bullet point from AI-generated meeting notes. The user wants to understand where this note came from in the original transcript and its full context.

Meeting Title: ${meeting.title}
Meeting Date: ${new Date(meeting.createdAt).toLocaleString()}

THE NOTE/BULLET POINT TO ANALYZE:
"${noteContent}"

FULL MEETING TRANSCRIPT:
${fullTranscript}

Your task:
1. Find the relevant part(s) of the transcript that this note summarizes or references
2. Generate a 3-part explanation in JSON format:

{
  "context": "A brief narrative (2-3 sentences) explaining what was being discussed at this moment in the meeting. Set the scene for the reader and explain how this topic came up.",
  "verbatimQuote": "The most relevant exact quote(s) from the transcript that this note is based on. Include the speaker and keep it concise but complete.",
  "implication": "A closing sentence (1-2 sentences) explaining the significance, outcome, or next steps related to this point. What does this mean for the participants?"
}

Return ONLY the JSON object, no additional text or markdown.`;

      try {
        const response = await aiProvider.complete(prompt, 'gpt-4o');

        console.log('DEEP DIVE RAW AI RESPONSE:', response);

        // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
        let cleanedResponse = response.trim();

        // Remove ```json or ``` at the start
        if (cleanedResponse.startsWith('```json')) {
          cleanedResponse = cleanedResponse.slice(7);
        } else if (cleanedResponse.startsWith('```')) {
          cleanedResponse = cleanedResponse.slice(3);
        }

        // Remove ``` at the end
        if (cleanedResponse.endsWith('```')) {
          cleanedResponse = cleanedResponse.slice(0, -3);
        }

        cleanedResponse = cleanedResponse.trim();

        console.log('DEEP DIVE CLEANED RESPONSE:', cleanedResponse);

        // Parse the JSON response
        const parsed = JSON.parse(cleanedResponse);

        console.log('DEEP DIVE PARSED:', parsed);

        return {
          context: parsed.context || '',
          verbatimQuote: parsed.verbatimQuote || noteContent,
          implication: parsed.implication || '',
          noteContent: noteContent,
        };
      } catch (parseError) {
        console.log('DEEP DIVE PARSE ERROR:', parseError);
        logger.error('Failed to parse notes deep dive response', {
          errorMessage: parseError instanceof Error ? parseError.message : 'Unknown error',
          meetingId,
          noteContent
        });
        return {
          context: 'Unable to generate context analysis.',
          verbatimQuote: noteContent,
          implication: 'Analysis unavailable.',
          noteContent: noteContent,
        };
      }
    }
  );

  // Enhanced Deep Dive - Granola-style zoom with semantic search
  ipcMain.handle(
    IPC_CHANNELS.ENHANCED_DEEP_DIVE,
    async (_, meetingId: string, noteBlockText: string) => {
      const { aiProvider, meetingRepo } = getContainer();

      logger.info('Enhanced deep dive requested', { meetingId, noteLength: noteBlockText.length });

      if (!aiProvider) {
        throw new Error('AI provider not configured');
      }

      const meeting = meetingRepo.findById(meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      try {
        const { EnhancedDeepDiveService } = await import('../services/EnhancedDeepDiveService');
        const deepDiveService = new EnhancedDeepDiveService();

        const result = await deepDiveService.performDeepDive(
          meetingId,
          noteBlockText,
          meeting.transcript
        );

        logger.info('Enhanced deep dive completed', {
          meetingId,
          isRawTranscript: result.isRawTranscript,
          totalTokens: result.totalTokens,
          chunkCount: result.transcriptSlice?.length || 0,
        });

        return result;
      } catch (error) {
        logger.error('Enhanced deep dive failed', { meetingId, error });
        throw error;
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.MEETING_NOTES_SAVE_MANUAL,
    (_, meetingId: string, content: string) => {
      const meeting = meetingRepo.findById(meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      // Append manual note entry to existing notes
      const noteEntries = meeting.noteEntries || [];
      const newEntry = {
        id: `${meetingId}-manual-${Date.now()}`,
        content,
        type: 'manual' as const,
        createdAt: new Date(),
        source: 'upcoming' as const,
      };

      noteEntries.push(newEntry);

      // Update meeting with new note entries
      meetingRepo.updateNoteEntries(meetingId, noteEntries);
      
      logger.info('Saved manual notes for meeting', { meetingId, entryId: newEntry.id, contentLength: content.length });
    }
  );

  // Desktop sources for audio capture
  ipcMain.handle(IPC_CHANNELS.AUDIO_GET_SOURCES, async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
    });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  });
}

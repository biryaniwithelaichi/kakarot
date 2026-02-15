import { buildStructuredNoteMessages, NoteGenerationContext } from '../prompts/summaryPrompts';
import { createLogger } from '../core/logger';
import { getSpeakerLabel } from '@shared/utils/formatters';
import type { AIProvider } from '../providers/OpenAIProvider';
import type { Meeting, TranscriptSegment, GeneratedStructuredNotes } from '@shared/types';

const logger = createLogger('NoteGenerationService');

export interface NoteGenerationOptions {
  meetingObjective?: string;   // Meeting type/objective if selected
  attendeeNames?: string[];    // Known attendee names
}

export class NoteGenerationService {
  constructor(private getAIProvider: () => AIProvider | null) {}

  async generateNotes(meeting: Meeting, options?: NoteGenerationOptions): Promise<GeneratedStructuredNotes | null> {
    const aiProvider = this.getAIProvider();
    if (!aiProvider) {
      logger.warn('No AI provider configured, skipping note generation');
      return null;
    }

    if (meeting.transcript.length === 0) {
      logger.warn('Empty transcript, skipping note generation');
      return null;
    }

    const transcriptText = this.formatTranscript(meeting.transcript);
    logger.info('Generating structured notes', { meetingId: meeting.id, transcriptLength: transcriptText.length });

    // Build context from meeting data and options
    const context: NoteGenerationContext = {
      meetingObjective: options?.meetingObjective,
      attendeeNames: options?.attendeeNames,
    };

    // Extract user notes from noteEntries (pre-meeting notes)
    if (meeting.noteEntries && meeting.noteEntries.length > 0) {
      const userNotes = meeting.noteEntries
        .filter(entry => entry.type === 'manual')
        .map(entry => entry.content)
        .join('\n\n');
      if (userNotes.trim()) {
        context.userNotes = userNotes;
        logger.info('Including user notes in context', { meetingId: meeting.id, noteCount: meeting.noteEntries.length });
      }
    }

    try {
      const messages = buildStructuredNoteMessages(transcriptText, context);
      const response = await aiProvider.chat(messages, {
        maxTokens: 6000,
        temperature: 0.3, // Slightly lower for more consistent output
        responseFormat: 'json',
      });

      // Extract JSON from response (model may include markdown code blocks)
      let jsonStr = response.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      // Also try to extract JSON object if there's preamble text
      if (!jsonMatch) {
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr) as GeneratedStructuredNotes;
      logger.info('Structured notes generated', {
        meetingId: meeting.id,
        titleLength: parsed.title.length,
        topicCount: parsed.topics.length,
        actionItemCount: parsed.actionItems.length,
        notesLength: parsed.notesMarkdown.length,
      });

      return parsed;
    } catch (error) {
      logger.error('Failed to generate structured notes', error as Error);
      return null;
    }
  }

  private formatTranscript(segments: TranscriptSegment[]): string {
    return segments
      .filter((s) => s.isFinal)
      .map((s) => `[${getSpeakerLabel(s.source)}]: ${s.text}`)
      .join('\n');
  }
}

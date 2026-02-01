import { buildNoteGenerationMessages } from '../prompts/summaryPrompts';
import { createLogger } from '../core/logger';
import { getSpeakerLabel } from '@shared/utils/formatters';
import type { AIProvider } from '../providers/OpenAIProvider';
import type { Meeting, TranscriptSegment } from '@shared/types';

const logger = createLogger('NoteGenerationService');

export interface GeneratedNotes {
  title: string;
  overview: string;
  notesMarkdown: string;
}

export class NoteGenerationService {
  constructor(private getAIProvider: () => AIProvider | null) {}

  async generateNotes(meeting: Meeting): Promise<GeneratedNotes | null> {
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
    logger.info('Generating notes', { meetingId: meeting.id, transcriptLength: transcriptText.length });

    try {
      const messages = buildNoteGenerationMessages(transcriptText);
      const response = await aiProvider.chat(messages, {
        maxTokens: 5000,
        temperature: 0.35,
      });

      // Extract JSON from response (model may include markdown code blocks)
      let jsonStr = response.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      const parsed = JSON.parse(jsonStr) as GeneratedNotes;
      logger.info('Notes generated', {
        meetingId: meeting.id,
        titleLength: parsed.title.length,
        notesLength: parsed.notesMarkdown.length,
      });

      return parsed;
    } catch (error) {
      logger.error('Failed to generate notes', error as Error);
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

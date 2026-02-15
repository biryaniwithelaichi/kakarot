import { v4 as uuidv4 } from 'uuid';
import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';
import { CALLOUT_CONFIG, CALLOUT_TIMER_CONFIG } from '../config/constants';
import { buildCalloutMessages, parseCalloutResponse } from '../prompts/calloutPrompts';
import { buildSummaryMessages } from '../prompts/summaryPrompts';
import { getSpeakerLabel } from '@shared/utils/formatters';
import type { Meeting, Callout, CalloutSource, TranscriptSegment } from '@shared/types';

const logger = createLogger('CalloutService');

interface PendingCallout {
  question: string;
  timerId: NodeJS.Timeout;
  onCallout: (callout: Callout) => void;
}

export class CalloutService {
  private recentTranscripts: TranscriptSegment[] = [];
  private pendingCallout: PendingCallout | null = null;

  /**
   * Add a transcript segment to the sliding window for context.
   * Call this on every final transcript (both mic and system).
   */
  addTranscriptSegment(segment: TranscriptSegment): void {
    this.recentTranscripts.push(segment);
    if (this.recentTranscripts.length > CALLOUT_CONFIG.MAX_CONTEXT_SEGMENTS) {
      this.recentTranscripts.shift();
    }
  }

  /**
   * Schedule a callout for a detected question.
   * Starts a timer; if no mic response cancels it, generates callout after delay.
   * If a new question arrives, replaces the pending one.
   */
  scheduleCallout(question: string, onCallout: (callout: Callout) => void): void {
    // Cancel existing pending callout
    if (this.pendingCallout) {
      clearTimeout(this.pendingCallout.timerId);
      logger.debug('Replaced pending callout with new question');
    }

    const timerId = setTimeout(async () => {
      logger.debug('Callout timer expired, generating response');
      try {
        const callout = await this.generateCallout(question);
        if (callout) {
          onCallout(callout);
        }
      } catch (error) {
        logger.error('Failed to generate callout', error);
      }
      this.pendingCallout = null;
    }, CALLOUT_TIMER_CONFIG.DELAY_MS);

    this.pendingCallout = { question, timerId, onCallout };
    logger.debug('Scheduled callout', { question: question.slice(0, 50) });
  }

  /**
   * Check if a mic transcript should cancel the pending callout.
   * Cancels if the user responded with 3+ words.
   */
  checkForMicResponse(text: string): void {
    if (!this.pendingCallout) return;

    const wordCount = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount >= CALLOUT_TIMER_CONFIG.MIN_RESPONSE_WORDS) {
      this.cancelPendingCallout();
      logger.debug('Cancelled callout - user responded', { wordCount });
    }
  }

  /**
   * Cancel any pending callout without generating it.
   */
  cancelPendingCallout(): void {
    if (this.pendingCallout) {
      clearTimeout(this.pendingCallout.timerId);
      this.pendingCallout = null;
    }
  }

  /**
   * Clear all state (call on recording stop).
   */
  reset(): void {
    this.cancelPendingCallout();
    this.recentTranscripts = [];
  }

  private async generateCallout(question: string): Promise<Callout | null> {
    const { aiProvider, calloutRepo, meetingRepo, settingsRepo } = getContainer();
    if (!aiProvider) {
      logger.warn('AI provider not configured - skipping callout generation');
      return null;
    }

    const conversationContext = this.getConversationContext();
    const pastMeetingContext = await this.getPastMeetingContext(question);

    const allContext = [conversationContext, pastMeetingContext]
      .filter(Boolean)
      .join('\n\n');

    // Get user profile for personalized responses
    const settings = settingsRepo.getSettings();
    const userProfile = settings.userProfile;

    const messages = buildCalloutMessages(question, allContext, userProfile);
    const response = await aiProvider.chat(messages, {
      responseFormat: 'json',
      maxTokens: 2000,
    });

    logger.debug('AI response for callout', { response: response.slice(0, 500) });
    const parsed = parseCalloutResponse(response);
    logger.debug('Parsed callout response', { isQuestion: parsed.isQuestion, hasSuggestion: !!parsed.suggestedResponse });
    if (!parsed.isQuestion || !parsed.suggestedResponse) {
      return null;
    }

    const sources: CalloutSource[] = [];
    if (conversationContext) {
      sources.push({
        type: 'meeting',
        title: 'Current conversation',
        excerpt: conversationContext.slice(0, 100) + '...',
      });
    }

    const callout: Callout = {
      id: uuidv4(),
      meetingId: meetingRepo.getCurrentMeetingId() || '',
      triggeredAt: new Date(),
      question,
      context: allContext,
      suggestedResponse: parsed.suggestedResponse,
      sources,
      dismissed: false,
    };

    calloutRepo.save(callout);
    logger.info('Generated callout', { id: callout.id });

    return callout;
  }

  private getConversationContext(): string {
    if (this.recentTranscripts.length === 0) return '';

    return this.recentTranscripts
      .map((seg) => `${getSpeakerLabel(seg.source)}: ${seg.text}`)
      .join('\n');
  }

  private async getPastMeetingContext(query: string): Promise<string> {
    const { meetingRepo } = getContainer();

    try {
      const meetings = meetingRepo.search(query);
      if (meetings.length === 0) return '';

      const excerpts: string[] = [];
      for (const meeting of meetings.slice(0, CALLOUT_CONFIG.MAX_PAST_MEETINGS)) {
        const relevantSegments = meeting.transcript
          .filter((seg) => seg.text.toLowerCase().includes(query.toLowerCase().split(' ')[0]))
          .slice(0, 2);

        if (relevantSegments.length > 0) {
          excerpts.push(
            `From "${meeting.title}":\n` + relevantSegments.map((s) => `  - ${s.text}`).join('\n')
          );
        }
      }

      return excerpts.length > 0 ? 'From past meetings:\n' + excerpts.join('\n') : '';
    } catch (error) {
      logger.warn('Past meeting search failed', { error });
      return '';
    }
  }

  async generateSummary(meeting: Meeting): Promise<string> {
    const { aiProvider } = getContainer();
    if (!aiProvider) {
      throw new Error('AI provider not configured');
    }

    const transcript = meeting.transcript
      .map((seg) => `${getSpeakerLabel(seg.source)}: ${seg.text}`)
      .join('\n');

    const messages = buildSummaryMessages(transcript);
    const response = await aiProvider.chat(messages, { maxTokens: 1000 });

    return response || 'Unable to generate summary.';
  }
}

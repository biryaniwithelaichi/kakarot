import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';
import { CRMEmailMatcher } from './CRMEmailMatcher';
import * as chrono from 'chrono-node';
import { isGreeting, isPureGreeting, startsWithGreeting, stripGreeting, getGreetingResponse } from '@shared/utils/greetingDetection';
import type {
  Meeting,
  HubSpotOAuthToken,
  TaskCommitment,
  CompanyInfo,
  SalesforceOAuthToken,
  TranscriptSegment,
  // New enhanced types
  EnhancedMeetingPrepResult,
  EnhancedPrepParticipant,
  ParticipantIntel,
  ActionItemStatus,
  TimelineEvent,
  CRMSnapshot,
  ConfidenceMetrics,
  LastSeenContext,
  UnresolvedThread,
  CRMContactData,
  MeetingSentiment,
  ParticipantPersona,
  // Dynamic prep types
  CustomMeetingType,
  CalendarEvent,
  SignalScore,
  PrepInsight,
  DynamicBrief,
  PendingActions,
  CRMValidation,
  InferredObjective,
  DynamicPrepResult,
  DynamicPrepParticipant,
  PrepContext,
  SignalWeight,
  // Multi-person synthesis types
  MeetingSynthesis,
  SynthesisTopic,
  // Conversational prep types
  QuickPrepInput,
  ConversationalPrepResult,
  ConversationalParticipantBrief,
  ProjectContext,
  OwnershipActions,
  SuggestedQuestion,
  InferredTrait,
  PrepCitation,
  Person,
  // Conversational chat types
  PrepChatInput,
  PrepChatResponse,
  PrepChatMessage,
  PrepConversation,
  // Query intelligence types
  QueryType,
  ClassifiedQuery,
  UserContext,
  // LLM entity extraction types
  ExtractedEntity,
  ExtractedEntityType,
  QueryIntent,
  TemporalReference,
} from '@shared/types';
import type { ContactSearchResult } from './HubSpotService';

const CONFIDENCE_THRESHOLD = 70;

const logger = createLogger('PrepService');

export interface PrepParticipant {
  name: string;
  email: string | null;
  company: string | null;
  domain: string | null;
}

export interface GenerateMeetingPrepInput {
  meeting: {
    meeting_type: string; // e.g., "product sync", "sales call", "board meeting"
    objective: string; // e.g., "Discuss Q1 roadmap"
  };
  participants: PrepParticipant[];
}

export interface ParticipantPrepSection {
  name: string;
  email: string | null;
  history_strength: 'strong' | 'weak' | 'org-only' | 'none';
  is_first_meeting: boolean;
  org_has_met_before: boolean;
  confidence_score: number; // 0-100
  data_gaps: string[];
  pending_task_commitments: TaskCommitment[];
  company_info?: CompanyInfo;
  context: {
    last_meeting_date: string | null;
    meeting_count: number;
    recent_topics: string[];
    key_points: string[];
  };
  talking_points: string[];
  questions_to_ask: string[];
  background: string;
}

export interface MeetingPrepOutput {
  meeting: {
    type: string;
    objective: string;
    duration_minutes: 5;
  };
  generated_at: string;
  participants: ParticipantPrepSection[];
  agenda: {
    opening: string;
    key_topics: string[];
    closing: string;
  };
  success_metrics: string[];
  risk_mitigation: string[];
}

export class PrepService {
  // Cache for entity extractions (key: normalized query, value: extracted entity with timestamp)
  private entityExtractionCache: Map<string, { entity: ExtractedEntity; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Cache for CRM contact data (key: email or name, value: CRM data with timestamp)
  private crmDataCache: Map<string, { data: CRMContactData | null; timestamp: number }> = new Map();
  private readonly CRM_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Extract entity from user query using LLM
   * This replaces regex-based pattern matching with intelligent understanding
   */
  async extractEntityWithLLM(
    message: string,
    conversationContext?: PrepConversation
  ): Promise<ExtractedEntity> {
    const { aiProvider } = getContainer();
    if (!aiProvider) {
      return this.createEmptyExtractedEntity();
    }

    // Check cache first
    const cacheKey = this.buildEntityCacheKey(message, conversationContext);
    const cached = this.entityExtractionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      logger.debug('Entity extraction cache hit', { message: message.substring(0, 50) });
      return cached.entity;
    }

    // Build context from conversation history
    const contextSummary = this.buildConversationContextForExtraction(conversationContext);

    const extractionPrompt = `Analyze this user query and extract structured information.

USER QUERY: "${message}"

${contextSummary ? `CONVERSATION CONTEXT:\n${contextSummary}\n` : ''}

Extract and return JSON with these fields:
{
  "entity": "The primary person, company, or project name mentioned (null if none)",
  "type": "person|company|project|meeting|topic|unknown",
  "intent": "prep|status|contact_info|follow_up|context|comparison|issues|action_items|discovery|unknown",
  "temporal": "next|last|recent|today|tomorrow|this_week|last_week|specific|null",
  "implicitResolutions": {"pronoun": "resolved name"} - resolve "they", "that meeting", "him/her" etc using context,
  "confidence": 0.0-1.0,
  "contextClues": {
    "urgency": "low|medium|high" or null,
    "emotionalTone": "neutral|positive|negative|frustrated|excited" or null,
    "relationshipType": "client|prospect|partner|colleague|unknown" or null
  }
}

EXAMPLES:
- "What's Devin's email?" → {"entity": "Devin", "type": "person", "intent": "contact_info", "temporal": null, ...}
- "How did that call go?" → resolve "that call" to most recent meeting from context
- "Prep for tomorrow" → {"entity": null, "type": "meeting", "intent": "prep", "temporal": "tomorrow", ...}
- "They seemed frustrated" → resolve "they" from conversation context
- Just "Medha" → {"entity": "Medha", "type": "person", "intent": "context", "temporal": null, ...}
- "Issues with Acme Corp" → {"entity": "Acme Corp", "type": "company", "intent": "issues", ...}

Return ONLY valid JSON, no explanation.`;

    try {
      const response = await aiProvider.chat(
        [{ role: 'user', content: extractionPrompt }],
        {
          model: 'gpt-4o-mini', // Use faster model for extraction
          temperature: 0.1,
          maxTokens: 500,
          responseFormat: 'json',
        }
      );

      const extracted = JSON.parse(response) as ExtractedEntity;

      // Validate and normalize the response
      const validated = this.validateExtractedEntity(extracted);

      // Cache the result
      this.entityExtractionCache.set(cacheKey, { entity: validated, timestamp: Date.now() });

      logger.info('LLM entity extraction completed', {
        message: message.substring(0, 50),
        entity: validated.entity,
        type: validated.type,
        intent: validated.intent,
        confidence: validated.confidence,
      });

      return validated;
    } catch (error) {
      logger.error('LLM entity extraction failed', { error, message: message.substring(0, 50) });
      return this.createEmptyExtractedEntity();
    }
  }

  /**
   * Build cache key for entity extraction
   */
  private buildEntityCacheKey(message: string, context?: PrepConversation): string {
    const normalizedMessage = message.toLowerCase().trim();
    const contextId = context?.participantContext?.email || context?.id || '';
    return `${normalizedMessage}::${contextId}`;
  }

  /**
   * Build conversation context summary for extraction
   */
  private buildConversationContextForExtraction(context?: PrepConversation): string {
    if (!context) return '';

    const parts: string[] = [];

    if (context.participantContext) {
      parts.push(`Currently discussing: ${context.participantContext.name}${context.participantContext.email ? ` (${context.participantContext.email})` : ''}`);
    }

    // Include last few messages for pronoun resolution
    const recentMessages = context.messages.slice(-4);
    if (recentMessages.length > 0) {
      parts.push('Recent conversation:');
      recentMessages.forEach(m => {
        parts.push(`- ${m.role}: ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`);
      });
    }

    return parts.join('\n');
  }

  /**
   * Validate and normalize extracted entity
   */
  private validateExtractedEntity(extracted: Partial<ExtractedEntity>): ExtractedEntity {
    const validTypes: ExtractedEntityType[] = ['person', 'company', 'project', 'meeting', 'topic', 'unknown'];
    const validIntents: QueryIntent[] = ['prep', 'status', 'contact_info', 'follow_up', 'context', 'comparison', 'issues', 'action_items', 'discovery', 'unknown'];
    const validTemporal: TemporalReference[] = ['next', 'last', 'recent', 'today', 'tomorrow', 'this_week', 'last_week', 'specific', null];

    return {
      entity: extracted.entity || null,
      type: validTypes.includes(extracted.type as ExtractedEntityType) ? extracted.type as ExtractedEntityType : 'unknown',
      intent: validIntents.includes(extracted.intent as QueryIntent) ? extracted.intent as QueryIntent : 'unknown',
      temporal: validTemporal.includes(extracted.temporal as TemporalReference) ? extracted.temporal as TemporalReference : null,
      implicitResolutions: extracted.implicitResolutions || {},
      confidence: typeof extracted.confidence === 'number' ? Math.max(0, Math.min(1, extracted.confidence)) : 0.5,
      contextClues: {
        urgency: extracted.contextClues?.urgency || undefined,
        emotionalTone: extracted.contextClues?.emotionalTone || undefined,
        relationshipType: extracted.contextClues?.relationshipType || undefined,
      },
    };
  }

  /**
   * Create empty extracted entity for fallback
   */
  private createEmptyExtractedEntity(): ExtractedEntity {
    return {
      entity: null,
      type: 'unknown',
      intent: 'unknown',
      temporal: null,
      implicitResolutions: {},
      confidence: 0,
      contextClues: {},
    };
  }

  /**
   * Clean up expired cache entries
   */
  cleanupEntityCache(): void {
    const now = Date.now();
    for (const [key, value] of this.entityExtractionCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL_MS) {
        this.entityExtractionCache.delete(key);
      }
    }
  }

  async generateMeetingPrep(input: GenerateMeetingPrepInput): Promise<MeetingPrepOutput> {
    logger.info('Generating meeting prep', {
      meetingType: input.meeting.meeting_type,
      participantCount: input.participants.length,
    });

    const { aiProvider, meetingRepo } = getContainer();
    if (!aiProvider) {
      throw new Error('AI provider not available');
    }
    if (!meetingRepo) {
      throw new Error('Meeting repository not available');
    }

    // Retrieve participant histories
    const participantContexts = await this.retrieveParticipantContexts(input.participants);

    // Prepare agent prompt with context
    const agentPrompt = this.buildAgentPrompt(input, participantContexts);

    // Call OpenAI with structured output (lower temperature for determinism)
    const prepContent = await aiProvider.chat(
      [{ role: 'user', content: agentPrompt }],
      {
        model: 'gpt-4o',
        temperature: 0.35,
        maxTokens: 2000,
        responseFormat: 'json',
      }
    );

    // Parse and validate response
    let prepData: MeetingPrepOutput;
    try {
      prepData = JSON.parse(prepContent);
    } catch (error) {
      logger.error('Failed to parse prep output', { error });
      throw new Error('Invalid AI response format');
    }

    // Validate output structure
    const validatedOutput = this.validateAndFormatOutput(prepData, input);

    // Enrich with additional data and apply confidence filtering
    const enrichedOutput = await this.enrichWithAdditionalData(validatedOutput, participantContexts);

    // Filter low confidence content
    return this.filterLowConfidenceContent(enrichedOutput, participantContexts);
  }

  async collectMeetingData(contactEmail: string): Promise<{
    contact: ContactSearchResult | null;
    pastMeetings: Meeting[];
    jiraTickets: unknown[];
  } | null> {
    try {
      const { hubSpotService, meetingRepo, settingsRepo } = getContainer();

      if (!contactEmail) {
        throw new Error('Contact email is required');
      }

      const settings = settingsRepo.getSettings();
      let hubspotToken = settings.crmConnections?.hubspot as HubSpotOAuthToken | undefined;

      if (hubspotToken && hubSpotService.isTokenExpired(hubspotToken) && hubspotToken.refreshToken) {
        hubspotToken = await hubSpotService.refreshAccessToken(hubspotToken.refreshToken);
        settingsRepo.updateSettings({
          crmConnections: {
            ...(settings.crmConnections || {}),
            hubspot: hubspotToken,
          },
        });
      }

      let contact: ContactSearchResult | null = null;
      if (hubspotToken?.accessToken) {
        const emailMatcher = new CRMEmailMatcher();
        const matches = await emailMatcher.findHubSpotContacts([contactEmail], hubspotToken);
        if (matches.length > 0) {
          const match = matches[0];
          contact = {
            id: match.crmId,
            email: match.email,
            name: match.crmName,
          };
        }
      }

      const pastMeetings = meetingRepo.findAll().filter((meeting) => {
        const attendees = meeting.attendeeEmails?.length ? meeting.attendeeEmails : meeting.participants;
        return attendees?.includes(contactEmail);
      });

      return {
        contact,
        jiraTickets: [],
        pastMeetings,
      };
    } catch (error) {
      logger.error('Error collecting meeting data', { error });
      return null;
    }
  }

  private async retrieveParticipantContexts(
    participants: PrepParticipant[]
  ): Promise<Record<string, ParticipantContext>> {
    const { meetingRepo } = getContainer();
    if (!meetingRepo) {
      throw new Error('Meeting repository not available');
    }

    const contexts: Record<string, ParticipantContext> = {};

    for (const participant of participants) {
      const meetings = meetingRepo.findAll();

      // Filter meetings by email or domain
      let filtered = this.filterMeetingsByParticipant(meetings, participant);

      // Sort by most recent
      filtered = filtered.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Keep only recent meetings (last 5)
      const recentMeetings = filtered.slice(0, 5);

      // Determine history strength
      const strength = this.determineHistoryStrength(participant, recentMeetings);

      // Extract context
      contexts[participant.email || participant.name] = {
        participant,
        meetings: recentMeetings,
        strength,
        recentTopics: this.extractTopics(recentMeetings),
        keyPoints: this.extractKeyPoints(recentMeetings),
      };
    }

    return contexts;
  }

  private filterMeetingsByParticipant(meetings: Meeting[], participant: PrepParticipant): Meeting[] {
    const participantNameLower = participant.name?.toLowerCase() || '';
    const participantEmailLower = participant.email?.toLowerCase() || '';
    const participantDomain = participant.domain?.toLowerCase() || '';
    const participantCompany = participant.company?.toLowerCase() || '';

    return meetings.filter((meeting) => {
      // Rule 1: Filter by exact email in attendeeEmails
      if (participantEmailLower && meeting.attendeeEmails?.length) {
        if (meeting.attendeeEmails.some(e => e.toLowerCase() === participantEmailLower)) {
          return true;
        }
      }

      // Rule 2: Filter by email in participants array (JSON field)
      if (participantEmailLower && meeting.participants) {
        try {
          const participants = typeof meeting.participants === 'string'
            ? JSON.parse(meeting.participants)
            : meeting.participants;
          if (Array.isArray(participants)) {
            const emailMatch = participants.some((p: any) =>
              p?.email?.toLowerCase() === participantEmailLower ||
              p?.toLowerCase?.() === participantEmailLower
            );
            if (emailMatch) return true;
          }
        } catch { /* ignore parse errors */ }
      }

      // Rule 3: Filter by name in meeting title (e.g., "Meeting with John Smith")
      if (participantNameLower && participantNameLower.length > 2) {
        const titleLower = meeting.title?.toLowerCase() || '';
        // Check if participant name appears in title
        if (titleLower.includes(participantNameLower)) {
          return true;
        }
        // Also check first name only for more matches
        const firstName = participantNameLower.split(' ')[0];
        if (firstName.length > 2 && titleLower.includes(firstName)) {
          return true;
        }
      }

      // Rule 4: Filter by domain in attendeeEmails
      if (participantDomain && meeting.attendeeEmails?.length) {
        const domainMatch = meeting.attendeeEmails.some((email) =>
          email.toLowerCase().endsWith(`@${participantDomain}`)
        );
        if (domainMatch) return true;
      }

      // Rule 5: Filter by company name in meeting title or notes
      if (participantCompany && participantCompany.length > 2) {
        const titleLower = meeting.title?.toLowerCase() || '';
        const notesLower = typeof meeting.notes === 'string' ? meeting.notes.toLowerCase() : '';
        const summaryLower = meeting.summary?.toLowerCase() || '';
        if (titleLower.includes(participantCompany) || notesLower.includes(participantCompany) || summaryLower.includes(participantCompany)) {
          return true;
        }
      }

      // Rule 6: Filter by name in people array (JSON field)
      if (participantNameLower && meeting.people) {
        try {
          const people = typeof meeting.people === 'string'
            ? JSON.parse(meeting.people)
            : meeting.people;
          if (Array.isArray(people)) {
            const nameMatch = people.some((p: any) =>
              p?.name?.toLowerCase()?.includes(participantNameLower) ||
              participantNameLower.includes(p?.name?.toLowerCase() || '')
            );
            if (nameMatch) return true;
          }
        } catch { /* ignore parse errors */ }
      }

      // Rule 7: Filter by name/email in noteEntries content
      if ((participantNameLower || participantEmailLower) && Array.isArray(meeting.noteEntries)) {
        const noteEntriesText = meeting.noteEntries
          .map((entry: any) => entry.content || '')
          .join(' ')
          .toLowerCase();
        if (participantNameLower && noteEntriesText.includes(participantNameLower)) {
          return true;
        }
        // Check first name
        if (participantNameLower) {
          const firstName = participantNameLower.split(' ')[0];
          if (firstName.length > 2 && noteEntriesText.includes(firstName)) {
            return true;
          }
        }
        if (participantEmailLower && noteEntriesText.includes(participantEmailLower)) {
          return true;
        }
      }

      // Rule 8: Filter by name in notesMarkdown
      if (participantNameLower && meeting.notesMarkdown) {
        const markdownLower = meeting.notesMarkdown.toLowerCase();
        if (markdownLower.includes(participantNameLower)) {
          return true;
        }
        const firstName = participantNameLower.split(' ')[0];
        if (firstName.length > 2 && markdownLower.includes(firstName)) {
          return true;
        }
      }

      return false;
    });
  }

  private determineHistoryStrength(
    participant: PrepParticipant,
    meetings: Meeting[]
  ): 'strong' | 'weak' | 'org-only' | 'none' {
    if (meetings.length === 0) {
      return 'none';
    }

    // strong: Email match with 3+ meetings or very recent (within 2 weeks)
    if (participant.email) {
      if (meetings.length >= 3) {
        return 'strong';
      }
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      if (meetings[0] && new Date(meetings[0].createdAt).getTime() > twoWeeksAgo) {
        return 'strong';
      }
    }

    // weak: Email match with 1-2 meetings
    if (participant.email && meetings.length <= 2) {
      return 'weak';
    }

    // org-only: Domain match
    if (!participant.email && participant.domain) {
      return 'org-only';
    }

    return 'none';
  }

  private extractTopics(meetings: Meeting[]): string[] {
    const topics = new Set<string>();

    meetings.forEach((meeting) => {
      // Extract from title
      if (meeting.title) {
        topics.add(meeting.title);
      }

      // Extract from summary
      if (meeting.summary) {
        // Simple heuristic: split by period and take first sentence
        const sentences = meeting.summary.split('.').filter((s) => s.trim());
        if (sentences.length > 0) {
          topics.add(sentences[0].trim());
        }
      }
    });

    return Array.from(topics).slice(0, 5);
  }

  private extractKeyPoints(meetings: Meeting[]): string[] {
    const keyPoints = new Set<string>();

    meetings.forEach((meeting) => {
      // Extract from action items
      if (meeting.actionItems && meeting.actionItems.length > 0) {
        meeting.actionItems.slice(0, 2).forEach((item) => {
          keyPoints.add(item);
        });
      }

      // Extract from transcript (participant mentions from system audio)
      if (meeting.transcript && meeting.transcript.length > 0) {
        const systemSegments = meeting.transcript.filter((s) => s.source === 'system');
        if (systemSegments.length > 0) {
          // Take first meaningful segment from other participants
          const meaningful = systemSegments.find((s) => s.text.length > 20);
          if (meaningful) {
            keyPoints.add(meaningful.text.substring(0, 100));
          }
        }
      }
    });

    return Array.from(keyPoints).slice(0, 5);
  }

  private buildAgentPrompt(
    input: GenerateMeetingPrepInput,
    contexts: Record<string, ParticipantContext>
  ): string {
    const contextStrings = Object.entries(contexts)
      .map(([_key, context]) => {
        const { participant, strength, recentTopics, keyPoints, meetings } = context;
        const isFirstMeeting = meetings.length === 0;

        // Build context lines conditionally - omit lines with no data
        const lines: string[] = [
          `**${participant.name}${participant.email ? ` (${participant.email})` : ''} [${strength}]**`
        ];
        if (participant.company) lines.push(`- Organization: ${participant.company}`);
        if (participant.domain) lines.push(`- Domain: ${participant.domain}`);
        lines.push(`- First meeting: ${isFirstMeeting ? 'YES - No prior history' : 'NO'}`);
        lines.push(`- Meeting history: ${meetings.length} meetings`);
        if (recentTopics.length > 0) lines.push(`- Recent Topics: ${recentTopics.join(', ')}`);
        if (keyPoints.length > 0) lines.push(`- Key Points: ${keyPoints.join(', ')}`);

        return lines.join('\n');
      })
      .join('\n\n');

    return `You are a meeting preparation assistant. Generate a factual briefing based ONLY on provided data.

CRITICAL RULES:
- ONLY include information you are highly confident about (70%+ certainty)
- If you lack sufficient context about a participant, mark their history_strength as "none" or "weak"
- DO NOT make assumptions about topics, relationships, or context that aren't clearly evident
- When uncertain, use neutral language like "Consider discussing..." instead of definitive statements
- If there's NO past meeting data, keep talking_points generic and professional
- For first-time meetings, explicitly state "This is your first meeting with [name]" in background
- NEVER use placeholder values like "N/A", "Unknown", "Not available", "No data", or similar
- If a field has no meaningful data, use null or an empty array [] - absence of data means absence of output
- Only include fields that have real, actionable information

MEETING DETAILS:
- Type: ${input.meeting.meeting_type}
- Objective: ${input.meeting.objective}
- Participants: ${input.participants.map((p) => p.name).join(', ')}

PARTICIPANT CONTEXT:
${contextStrings}

INSTRUCTIONS:
1. Return VALID JSON only - no markdown, no extra text
2. For each participant with history, generate 2-3 specific talking points and 1-2 questions
3. For participants with NO history, use generic professional talking points
4. Use "none" for history_strength when no data exists - DO NOT invent context
5. Generate 3-4 key agenda topics based on actual meeting objective
6. Include 2-3 measurable success metrics
7. Include 2-3 risk mitigation strategies
8. Keep all fields concise (15-25 words per field)
9. Duration is always exactly 5 minutes

RESPONSE FORMAT:
{
  "meeting": {
    "type": "string",
    "objective": "string",
    "duration_minutes": 5
  },
  "generated_at": "ISO8601 timestamp",
  "participants": [
    {
      "name": "string",
      "email": "string or null",
      "history_strength": "strong|weak|org-only|none",
      "is_first_meeting": boolean,
      "context": {
        "last_meeting_date": "ISO8601 or null",
        "meeting_count": number,
        "recent_topics": ["string"],
        "key_points": ["string"]
      },
      "talking_points": ["string"],
      "questions_to_ask": ["string"],
      "background": "string (1-2 sentences, state if first meeting)"
    }
  ],
  "agenda": {
    "opening": "string (1-2 sentences)",
    "key_topics": ["string"],
    "closing": "string (1-2 sentences)"
  },
  "success_metrics": ["string"],
  "risk_mitigation": ["string"]
}`;
  }

  private validateAndFormatOutput(
    prepData: any,
    input: GenerateMeetingPrepInput
  ): MeetingPrepOutput {
    // Ensure top-level structure
    if (!prepData.meeting || !prepData.participants || !prepData.agenda) {
      throw new Error('Invalid prep output structure');
    }

    // Ensure meeting object
    const meeting = {
      type: prepData.meeting.type || input.meeting.meeting_type,
      objective: prepData.meeting.objective || input.meeting.objective,
      duration_minutes: 5 as const,
    };

    // Ensure participants array
    const participants: ParticipantPrepSection[] = (prepData.participants || []).map(
      (p: any, index: number) => ({
        name: p.name || input.participants[index]?.name || input.participants[index]?.email || '',
        email: p.email || null,
        history_strength: (['strong', 'weak', 'org-only', 'none'].includes(p.history_strength)
          ? p.history_strength
          : 'none') as 'strong' | 'weak' | 'org-only' | 'none',
        is_first_meeting: p.is_first_meeting ?? (p.context?.meeting_count === 0),
        org_has_met_before: false, // Will be enriched later
        confidence_score: 0, // Will be calculated later
        data_gaps: [], // Will be populated later
        pending_task_commitments: [], // Will be populated later
        context: {
          last_meeting_date: p.context?.last_meeting_date || null,
          meeting_count: p.context?.meeting_count || 0,
          recent_topics: Array.isArray(p.context?.recent_topics) ? p.context.recent_topics : [],
          key_points: Array.isArray(p.context?.key_points) ? p.context.key_points : [],
        },
        talking_points: Array.isArray(p.talking_points) ? p.talking_points : [],
        questions_to_ask: Array.isArray(p.questions_to_ask) ? p.questions_to_ask : [],
        background: p.background || '',
      })
    );

    // Ensure agenda
    const agenda = {
      opening: prepData.agenda?.opening || `Prepare to discuss ${input.meeting.objective}.`,
      key_topics: Array.isArray(prepData.agenda?.key_topics) ? prepData.agenda.key_topics : [],
      closing: prepData.agenda?.closing || 'Confirm next steps and follow-up items.',
    };

    // Ensure metrics and mitigations
    const success_metrics = Array.isArray(prepData.success_metrics) ? prepData.success_metrics : [];
    const risk_mitigation = Array.isArray(prepData.risk_mitigation)
      ? prepData.risk_mitigation
      : [];

    return {
      meeting,
      generated_at: new Date().toISOString(),
      participants,
      agenda,
      success_metrics,
      risk_mitigation,
    };
  }

  /**
   * Enrich the prep output with additional data:
   * - First meeting detection
   * - Org-wide history check
   * - Task commitments from past meetings
   * - Confidence scoring
   */
  private async enrichWithAdditionalData(
    prepData: MeetingPrepOutput,
    contexts: Record<string, ParticipantContext>
  ): Promise<MeetingPrepOutput> {
    const enrichedParticipants = await Promise.all(
      prepData.participants.map(async (p) => {
        const ctx = contexts[p.email || p.name];
        const meetingCount = ctx?.meetings.length || 0;

        // Check if this is a first meeting
        const isFirstMeeting = meetingCount === 0;

        // Check org-wide history
        const orgHistory = await this.checkOrgWideHistory(
          p.email || '',
          ctx?.participant.domain || null
        );

        // Get task commitments from past meetings
        const taskCommitments = p.email
          ? await this.getTaskCommitmentsForParticipant(p.email)
          : [];

        // Calculate confidence score
        let confidenceScore = 0;
        if (meetingCount >= 3) confidenceScore = 90;
        else if (meetingCount >= 1) confidenceScore = 60;
        else if (orgHistory.anyOrgMeetings) confidenceScore = 40;
        else confidenceScore = 20;

        // Identify data gaps
        const dataGaps: string[] = [];
        if (meetingCount === 0) dataGaps.push('No direct meeting history');
        if (!p.email) dataGaps.push('Email not available');
        if (ctx?.recentTopics.length === 0) dataGaps.push('No recent topics');
        if (ctx?.keyPoints.length === 0) dataGaps.push('No key points from past meetings');

        return {
          ...p,
          is_first_meeting: isFirstMeeting,
          org_has_met_before: orgHistory.anyOrgMeetings,
          confidence_score: confidenceScore,
          data_gaps: dataGaps,
          pending_task_commitments: taskCommitments,
        };
      })
    );

    return {
      ...prepData,
      participants: enrichedParticipants,
    };
  }

  /**
   * Filter and sanitize low confidence content
   * Ensures we don't present made-up information as fact
   */
  private filterLowConfidenceContent(
    prepData: MeetingPrepOutput,
    contexts: Record<string, ParticipantContext>
  ): MeetingPrepOutput {
    return {
      ...prepData,
      participants: prepData.participants.map((p) => {
        // If below confidence threshold, sanitize talking points
        if (p.confidence_score < CONFIDENCE_THRESHOLD) {
          return {
            ...p,
            talking_points: p.talking_points.map(tp =>
              tp.startsWith('Consider') ? tp : `Consider discussing: ${tp.replace(/^(Discuss|Talk about|Mention)\s*/i, '')}`
            ),
            background: p.is_first_meeting
              ? `This is your first meeting with ${p.name}. ${p.org_has_met_before ? 'Others in your organization have met with them before.' : 'No prior organizational history available.'}`
              : p.background,
          };
        }
        return p;
      }),
    };
  }

  /**
   * Check if anyone in the organization has met this person
   */
  private async checkOrgWideHistory(
    participantEmail: string,
    participantDomain: string | null
  ): Promise<OrgHistoryResult> {
    const { meetingRepo } = getContainer();
    if (!meetingRepo) {
      return { anyOrgMeetings: false, meetingCount: 0 };
    }

    const allMeetings = meetingRepo.findAll();

    // Find any meeting where this person attended (by email or domain)
    const relevantMeetings = allMeetings.filter((m) => {
      if (participantEmail && m.attendeeEmails?.includes(participantEmail)) {
        return true;
      }
      if (participantDomain && m.attendeeEmails?.some(e => e.endsWith(`@${participantDomain}`))) {
        return true;
      }
      return false;
    });

    if (relevantMeetings.length === 0) {
      return { anyOrgMeetings: false, meetingCount: 0 };
    }

    // Sort by date to get most recent
    const sorted = relevantMeetings.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      anyOrgMeetings: true,
      lastOrgMeeting: new Date(sorted[0].createdAt),
      meetingCount: relevantMeetings.length,
    };
  }

  /**
   * Get task commitments for a participant from past meetings
   */
  async getTaskCommitmentsForParticipant(participantEmail: string): Promise<TaskCommitment[]> {
    const { meetingRepo } = getContainer();
    if (!meetingRepo || !participantEmail) {
      return [];
    }

    const meetings = meetingRepo.findAll();
    const commitments: TaskCommitment[] = [];

    for (const meeting of meetings) {
      if (!meeting.attendeeEmails?.includes(participantEmail)) continue;

      // Extract from action items
      if (meeting.actionItems && meeting.actionItems.length > 0) {
        meeting.actionItems.forEach((item, idx) => {
          commitments.push({
            id: `${meeting.id}-action-${idx}`,
            meetingId: meeting.id,
            meetingTitle: meeting.title,
            meetingDate: meeting.createdAt,
            participantEmail,
            description: item,
            completed: false, // Default to not completed
            source: 'action_item',
          });
        });
      }
    }

    // Sort by date (most recent first) and limit
    return commitments
      .sort((a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime())
      .slice(0, 10);
  }

  /**
   * Extract task commitments from transcript using AI
   */
  async extractTasksFromTranscript(
    meetingId: string,
    participantEmail: string
  ): Promise<TaskCommitment[]> {
    const { meetingRepo, aiProvider } = getContainer();
    if (!meetingRepo || !aiProvider) {
      return [];
    }

    const meeting = meetingRepo.findById(meetingId);
    if (!meeting || !meeting.transcript || meeting.transcript.length === 0) {
      return [];
    }

    // Build transcript text
    const transcriptText = meeting.transcript
      .map(s => `[${s.source}]: ${s.text}`)
      .join('\n');

    const prompt = `Analyze this meeting transcript and extract any commitments, promises, or action items made.

TRANSCRIPT:
${transcriptText}

RULES:
- Only extract CLEAR commitments (e.g., "I will...", "We'll follow up...", "Let me send you...")
- Do NOT invent or assume commitments
- If no clear commitments are found, return an empty array
- Keep descriptions concise (under 100 characters)

Return JSON only:
{
  "commitments": [
    { "description": "string", "speaker": "mic|system" }
  ]
}`;

    try {
      const response = await aiProvider.chat(
        [{ role: 'user', content: prompt }],
        {
          model: 'gpt-4o',
          temperature: 0.2, // Very low for consistency
          maxTokens: 500,
          responseFormat: 'json',
        }
      );

      const parsed = JSON.parse(response);
      const commitments = parsed.commitments || [];

      return commitments.map((c: { description: string; speaker: string }, idx: number) => ({
        id: `${meetingId}-extracted-${idx}`,
        meetingId,
        meetingTitle: meeting.title,
        meetingDate: meeting.createdAt,
        participantEmail,
        description: c.description,
        completed: false,
        source: 'transcript_extraction' as const,
      }));
    } catch (error) {
      logger.error('Failed to extract tasks from transcript', { error, meetingId });
      return [];
    }
  }

  // ============================================================
  // ENHANCED PREP GENERATION - New revamped meeting prep
  // ============================================================

  /**
   * Generate enhanced meeting prep with the new format
   * Includes: Last seen context, CRM snapshot, participant intel, action items, timeline
   */
  async generateEnhancedMeetingPrep(input: GenerateMeetingPrepInput): Promise<EnhancedMeetingPrepResult> {
    logger.info('Generating enhanced meeting prep', {
      meetingType: input.meeting.meeting_type,
      participantCount: input.participants.length,
    });

    const { aiProvider, meetingRepo, settingsRepo, hubSpotService, salesforceService } = getContainer();
    if (!aiProvider) throw new Error('AI provider not available');
    if (!meetingRepo) throw new Error('Meeting repository not available');

    const settings = settingsRepo?.getSettings();
    const participants: EnhancedPrepParticipant[] = [];

    for (const participant of input.participants) {
      const enhancedParticipant = await this.buildEnhancedParticipant(
        participant,
        meetingRepo,
        aiProvider,
        settings,
        hubSpotService,
        salesforceService
      );
      participants.push(enhancedParticipant);
    }

    return {
      meeting: {
        type: input.meeting.meeting_type,
        objective: input.meeting.objective,
      },
      generatedAt: new Date().toISOString(),
      participants,
    };
  }

  /**
   * Build enhanced participant data with all blocks
   */
  private async buildEnhancedParticipant(
    participant: PrepParticipant,
    meetingRepo: any,
    aiProvider: any,
    settings: any,
    hubSpotService: any,
    salesforceService: any
  ): Promise<EnhancedPrepParticipant> {
    const email = participant.email;

    // Get past meetings with this participant
    const allMeetings = meetingRepo.findAll();
    const participantMeetings = this.filterMeetingsByParticipant(allMeetings, participant)
      .sort((a: Meeting, b: Meeting) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const isFirstMeeting = participantMeetings.length === 0;

    // Fetch CRM data if available
    let crmData: CRMContactData | null = null;
    if (email) {
      crmData = await this.fetchCRMData(email, settings, hubSpotService, salesforceService);
    }

    // Build last seen context
    const lastSeen = this.buildLastSeenContext(participantMeetings, aiProvider);

    // Build participant intel (Block A)
    const intel = await this.buildParticipantIntel(
      participant,
      participantMeetings,
      crmData,
      aiProvider
    );

    // Build action items (Block B)
    const actionItems = this.buildActionItems(participantMeetings, email);

    // Build timeline (Block C)
    const timeline = this.buildTimeline(participantMeetings, crmData);

    // Extract CRM snapshot (primary deal)
    const crmSnapshot = crmData?.deals?.[0] || undefined;

    // Build unresolved threads
    const unresolvedThreads = await this.extractUnresolvedThreads(
      participantMeetings,
      crmData,
      aiProvider
    );

    // Calculate confidence
    const confidence = this.calculateConfidence(participantMeetings, crmData);

    return {
      name: participant.name,
      email: participant.email,
      lastSeen: lastSeen || undefined,
      intel,
      actionItems,
      timeline,
      crmSnapshot,
      unresolvedThreads,
      confidence,
      isFirstMeeting,
    };
  }

  /**
   * Fetch CRM data with caching (10 minute TTL)
   * Avoids repeated API calls for the same contact
   */
  private async fetchCRMDataCached(
    email: string,
    settings: any,
    hubSpotService: any,
    salesforceService: any
  ): Promise<CRMContactData | null> {
    const cacheKey = email.toLowerCase();
    const cached = this.crmDataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CRM_CACHE_TTL_MS) {
      logger.debug('CRM data cache hit', { email });
      return cached.data;
    }

    const data = await this.fetchCRMData(email, settings, hubSpotService, salesforceService);
    this.crmDataCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * Fetch CRM data from HubSpot or Salesforce
   */
  private async fetchCRMData(
    email: string,
    settings: any,
    hubSpotService: any,
    salesforceService: any
  ): Promise<CRMContactData | null> {
    try {
      // Try HubSpot first
      const hubspotToken = settings?.crmConnections?.hubspot as HubSpotOAuthToken | undefined;
      if (hubspotToken?.accessToken && hubSpotService) {
        // Refresh token if needed
        let token = hubspotToken;
        if (hubSpotService.isTokenExpired(token) && token.refreshToken) {
          token = await hubSpotService.refreshAccessToken(token.refreshToken);
        }
        const data = await hubSpotService.getContactData(email, token.accessToken);
        if (data) return data;
      }

      // Try Salesforce
      const salesforceToken = settings?.crmConnections?.salesforce as SalesforceOAuthToken | undefined;
      if (salesforceToken?.accessToken && salesforceService) {
        const data = await salesforceService.getContactData(
          email,
          salesforceToken.accessToken,
          salesforceToken.instanceUrl
        );
        if (data) return data;
      }

      return null;
    } catch (error) {
      logger.warn('Failed to fetch CRM data', { email, error });
      return null;
    }
  }

  /**
   * Fetch CRM data for chat with caching and name-based fallback
   * Encapsulates all CRM lookup logic for parallel execution
   */
  private async fetchCRMDataForChat(
    personEmail: string | null | undefined,
    personName: string | null | undefined,
    useNameSearch: boolean,
    settings: any,
    hubSpotService: any,
    salesforceService: any
  ): Promise<CRMContactData | null> {
    let crmData: CRMContactData | null = null;

    // First try email-based lookup (faster, more accurate)
    if (personEmail && !useNameSearch) {
      crmData = await this.fetchCRMDataCached(personEmail, settings, hubSpotService, salesforceService);
      if (crmData) {
        logger.debug('Fetched CRM data by email for chat', { email: personEmail, hasCrmData: true });
        return crmData;
      }
    }

    // Fallback to name-based search
    if (!crmData && personName && hubSpotService) {
      try {
        const hubspotToken = settings?.crmConnections?.hubspot as HubSpotOAuthToken | undefined;
        if (hubspotToken?.accessToken) {
          let token = hubspotToken;
          if (hubSpotService.isTokenExpired(token) && token.refreshToken) {
            token = await hubSpotService.refreshAccessToken(token.refreshToken);
          }

          // Search HubSpot by name
          const contact = await hubSpotService.searchContactByName(personName, token.accessToken);
          if (contact?.email) {
            // Found contact by name, fetch full CRM data with caching
            crmData = await this.fetchCRMDataCached(contact.email, settings, hubSpotService, salesforceService);
            if (crmData) {
              logger.info('Found CRM contact by name search', { name: personName, email: contact.email });
            }
          }
        }
      } catch (err) {
        logger.warn('Failed to search CRM by name', { name: personName, error: err });
      }
    }

    return crmData;
  }

  /**
   * Build last seen context from past meetings
   */
  private buildLastSeenContext(
    meetings: Meeting[],
    _aiProvider: any
  ): LastSeenContext | null {
    if (meetings.length === 0) return null;

    const lastMeeting = meetings[0];
    const daysAgo = Math.floor(
      (Date.now() - new Date(lastMeeting.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Extract topic from title or summary
    const topic = lastMeeting.title || lastMeeting.summary?.split('.')[0] || 'General discussion';

    // Simple sentiment heuristic based on content
    // In production, this would use AI analysis
    let sentiment: MeetingSentiment = 'Neutral';
    const summary = (lastMeeting.summary || '').toLowerCase();
    if (summary.includes('great') || summary.includes('excellent') || summary.includes('agreed')) {
      sentiment = 'Positive';
    } else if (summary.includes('concern') || summary.includes('issue') || summary.includes('disagree')) {
      sentiment = 'Tense';
    }

    return {
      daysAgo,
      date: new Date(lastMeeting.createdAt).toISOString(),
      topic: topic.substring(0, 100),
      sentiment,
      meetingId: lastMeeting.id,
    };
  }

  /**
   * Build participant intel (Block A: The "Who")
   */
  private async buildParticipantIntel(
    _participant: PrepParticipant,
    meetings: Meeting[],
    crmData: CRMContactData | null,
    aiProvider: any
  ): Promise<ParticipantIntel> {
    // Derive persona from meeting content and CRM data
    const persona = await this.derivePersona(meetings, crmData, aiProvider);

    // Extract personal facts from transcripts
    const personalFacts = this.extractPersonalFacts(meetings);

    // Build recent activity from CRM
    const recentActivity = this.buildRecentActivity(crmData);

    // Get CRM role
    const crmRole = crmData?.role || undefined;

    return {
      persona,
      personalFacts,
      recentActivity,
      crmRole,
    };
  }

  /**
   * Derive participant persona from interactions
   */
  private async derivePersona(
    meetings: Meeting[],
    crmData: CRMContactData | null,
    _aiProvider: any
  ): Promise<ParticipantPersona | null> {
    // Simple heuristics - in production would use AI
    const allText = meetings
      .map(m => `${m.title || ''} ${m.summary || ''}`)
      .join(' ')
      .toLowerCase();

    // Check CRM role first
    const crmRole = (crmData?.role || '').toLowerCase();
    if (crmRole.includes('executive') || crmRole.includes('ceo') || crmRole.includes('vp')) {
      return 'Executive';
    }

    // Check job title
    const jobTitle = (crmData?.jobTitle || '').toLowerCase();
    if (jobTitle.includes('engineer') || jobTitle.includes('developer') || jobTitle.includes('technical')) {
      return 'Technical';
    }
    if (jobTitle.includes('ceo') || jobTitle.includes('cto') || jobTitle.includes('director') || jobTitle.includes('vp')) {
      return 'Executive';
    }

    // Check meeting content
    if (allText.includes('api') || allText.includes('integration') || allText.includes('technical')) {
      return 'Technical';
    }
    if (allText.includes('budget') || allText.includes('roi') || allText.includes('approval')) {
      return 'Executive';
    }
    if (allText.includes('concern') || allText.includes('risk') || allText.includes('competitor')) {
      return 'Skeptic';
    }
    if (allText.includes('excited') || allText.includes('champion') || allText.includes('advocate')) {
      return 'Champion';
    }

    // Return null when no persona can be derived - absence of data means absence of UI
    return null;
  }

  /**
   * Extract personal facts from past meeting transcripts
   */
  private extractPersonalFacts(meetings: Meeting[]): string[] {
    const facts: string[] = [];

    // Look for common small talk patterns in transcripts
    for (const meeting of meetings.slice(0, 3)) {
      if (!meeting.transcript) continue;

      const text = meeting.transcript
        .filter(s => s.source === 'system') // Other participant's speech
        .map(s => s.text)
        .join(' ')
        .toLowerCase();

      // Location mentions
      if (text.includes('bangalore') || text.includes('bengaluru')) {
        facts.push('Based in Bengaluru');
      } else if (text.includes('new york') || text.includes('nyc')) {
        facts.push('Based in New York');
      } else if (text.includes('san francisco') || text.includes('sf')) {
        facts.push('Based in San Francisco');
      }

      // Hobbies/interests
      if (text.includes('trek') || text.includes('hiking')) {
        facts.push('Enjoys trekking/hiking');
      }
      if (text.includes('kids') || text.includes('children') || text.includes('soccer game')) {
        facts.push('Has children');
      }
      if (text.includes('vacation') || text.includes('holiday')) {
        facts.push('Recently mentioned vacation plans');
      }
    }

    // Deduplicate and limit
    return [...new Set(facts)].slice(0, 3);
  }

  /**
   * Build recent activity from CRM data
   */
  private buildRecentActivity(crmData: CRMContactData | null): string[] {
    const activities: string[] = [];

    if (!crmData) return activities;

    // Recent emails
    const recentEmails = crmData.emails?.slice(0, 3) || [];
    if (recentEmails.length > 0) {
      const latestEmail = recentEmails[0];
      activities.push(`Latest email: "${latestEmail.subject}" (${this.formatRelativeDate(latestEmail.date)})`);
    }

    // Recent notes (support tickets, etc.)
    const recentNotes = crmData.notes?.slice(0, 2) || [];
    for (const note of recentNotes) {
      const preview = note.content.substring(0, 50);
      activities.push(`CRM Note: "${preview}..." (${this.formatRelativeDate(note.date)})`);
    }

    // Deal activity
    if (crmData.deals?.length) {
      const deal = crmData.deals[0];
      if (deal.dealStage) {
        activities.push(`Deal in "${deal.dealStage}" stage`);
      }
    }

    return activities.slice(0, 3);
  }

  /**
   * Build action items (Block B: The "History")
   */
  private buildActionItems(meetings: Meeting[], _email: string | null): ActionItemStatus[] {
    const items: ActionItemStatus[] = [];

    for (const meeting of meetings.slice(0, 5)) {
      if (!meeting.actionItems) continue;

      for (let i = 0; i < meeting.actionItems.length; i++) {
        const item = meeting.actionItems[i];

        // Simple heuristic to determine assignment
        const itemLower = item.toLowerCase();
        const assignedTo: 'them' | 'us' =
          itemLower.includes('they will') || itemLower.includes('they\'ll') ||
          itemLower.includes('send us') || itemLower.includes('get back')
            ? 'them' : 'us';

        items.push({
          id: `${meeting.id}-action-${i}`,
          description: item,
          assignedTo,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          meetingDate: new Date(meeting.createdAt).toISOString(),
          completed: false,
          source: 'meeting_notes',
        });
      }
    }

    return items.slice(0, 10);
  }

  /**
   * Build timeline (Block C) from meetings and CRM data
   */
  private buildTimeline(meetings: Meeting[], crmData: CRMContactData | null): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // Add meetings to timeline
    for (const meeting of meetings.slice(0, 5)) {
      events.push({
        id: `meeting-${meeting.id}`,
        date: new Date(meeting.createdAt).toISOString(),
        type: 'meeting',
        source: 'Meeting Notes',
        summary: meeting.summary?.split('.')[0] || meeting.title || 'Meeting',
        metadata: { meetingTitle: meeting.title },
      });
    }

    // Add CRM emails to timeline
    if (crmData?.emails) {
      for (const email of crmData.emails.slice(0, 5)) {
        events.push({
          id: `email-${email.id}`,
          date: email.date,
          type: 'email',
          source: crmData.source === 'hubspot' ? 'HubSpot' : 'Salesforce',
          summary: email.subject,
          metadata: { emailSubject: email.subject },
        });
      }
    }

    // Add CRM notes to timeline
    if (crmData?.notes) {
      for (const note of crmData.notes.slice(0, 3)) {
        events.push({
          id: `note-${note.id}`,
          date: note.date,
          type: 'note',
          source: crmData.source === 'hubspot' ? 'HubSpot' : 'Salesforce',
          summary: note.content.substring(0, 100),
        });
      }
    }

    // Add deal updates to timeline
    if (crmData?.deals) {
      for (const deal of crmData.deals.slice(0, 2)) {
        if (deal.dealStage) {
          events.push({
            id: `deal-${deal.dealId || deal.dealName}`,
            date: deal.closeDate || new Date().toISOString(),
            type: 'deal_update',
            source: crmData.source === 'hubspot' ? 'HubSpot' : 'Salesforce',
            summary: `Deal "${deal.dealName}" in ${deal.dealStage}`,
            metadata: { dealStage: deal.dealStage },
          });
        }
      }
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return events.slice(0, 10);
  }

  /**
   * Extract unresolved threads (promises not kept)
   */
  private async extractUnresolvedThreads(
    meetings: Meeting[],
    crmData: CRMContactData | null,
    _aiProvider: any
  ): Promise<UnresolvedThread[]> {
    const threads: UnresolvedThread[] = [];

    // Look for action items that might be unresolved
    for (const meeting of meetings.slice(0, 3)) {
      if (!meeting.actionItems) continue;

      for (let i = 0; i < meeting.actionItems.length; i++) {
        const item = meeting.actionItems[i];
        const itemLower = item.toLowerCase();

        // Check if it's something they were supposed to do
        if (
          itemLower.includes('they will send') ||
          itemLower.includes('they\'ll send') ||
          itemLower.includes('promised to') ||
          itemLower.includes('will provide') ||
          itemLower.includes('get back to us')
        ) {
          // Check if there's a follow-up email in CRM mentioning completion
          const resolved = crmData?.emails?.some(
            e => e.subject.toLowerCase().includes('attached') ||
                 e.subject.toLowerCase().includes('as discussed')
          );

          if (!resolved) {
            threads.push({
              id: `thread-${meeting.id}-${i}`,
              description: item,
              originMeetingId: meeting.id,
              originMeetingDate: new Date(meeting.createdAt).toISOString(),
              originMeetingTitle: meeting.title,
              promisedBy: 'them',
              source: 'meeting_notes',
            });
          }
        }
      }
    }

    return threads.slice(0, 5);
  }

  /**
   * Calculate confidence with source attribution
   */
  private calculateConfidence(
    meetings: Meeting[],
    crmData: CRMContactData | null
  ): ConfidenceMetrics {
    const meetingCount = meetings.length;
    const emailCount = crmData?.emails?.length || 0;
    const noteCount = crmData?.notes?.length || 0;

    // Calculate score based on data availability
    let score = 20; // Base score for any lookup
    score += Math.min(meetingCount * 20, 40); // Up to 40 for meetings
    score += Math.min(emailCount * 5, 20); // Up to 20 for emails
    score += Math.min(noteCount * 5, 10); // Up to 10 for notes
    if (crmData?.deals?.length) score += 10; // Bonus for deal data

    score = Math.min(score, 100);

    // Build explanation
    const parts: string[] = [];
    if (meetingCount > 0) parts.push(`${meetingCount} Meeting${meetingCount > 1 ? 's' : ''}`);
    if (emailCount > 0) parts.push(`${emailCount} Email${emailCount > 1 ? 's' : ''}`);
    if (noteCount > 0) parts.push(`${noteCount} CRM Note${noteCount > 1 ? 's' : ''}`);
    if (parts.length === 0) parts.push('No data sources');

    return {
      score,
      sources: {
        meetings: meetingCount,
        emails: emailCount,
        crmNotes: noteCount,
        calls: 0,
      },
      explanation: `Data from: ${parts.join(', ')}`,
    };
  }

  /**
   * Analyze meeting sentiment using AI
   */
  async analyzeMeetingSentiment(transcript: TranscriptSegment[]): Promise<MeetingSentiment> {
    const { aiProvider } = getContainer();
    if (!aiProvider || transcript.length === 0) return 'Neutral';

    const text = transcript.map(s => s.text).join(' ').substring(0, 2000);

    const prompt = `Analyze the overall sentiment/mood of this meeting transcript.
Return ONLY one word: "Positive", "Neutral", or "Tense"

Transcript:
${text}`;

    try {
      const response = await aiProvider.chat(
        [{ role: 'user', content: prompt }],
        { model: 'gpt-4o', temperature: 0.1, maxTokens: 10 }
      );

      const cleaned = response.trim().toLowerCase();
      if (cleaned.includes('positive')) return 'Positive';
      if (cleaned.includes('tense')) return 'Tense';
      return 'Neutral';
    } catch {
      return 'Neutral';
    }
  }

  /**
   * Format relative date for display
   */
  private formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }

  // ============================================================
  // DYNAMIC PREP SYSTEM - Signal-driven, role-agnostic
  // ============================================================

  /**
   * Build dynamic prompt that injects customPrompt, attendeeRoles, and objectives
   * from the CustomMeetingType (if provided)
   */
  buildDynamicPrompt(
    basePrompt: string,
    objective: CustomMeetingType | null,
    signals: SignalScore[]
  ): string {
    let prompt = basePrompt;

    // Inject signal context
    if (signals.length > 0) {
      const signalSummary = signals
        .filter(s => s.normalizedScore > 0.3) // Only include meaningful signals
        .map(s => `- ${s.category}: ${s.normalizedScore.toFixed(2)} (weight: ${s.weight.toFixed(2)})`)
        .join('\n');

      if (signalSummary) {
        prompt += `\n\nIMPORTANCE SIGNALS (use to prioritize content):\n${signalSummary}`;
      }
    }

    // Inject customPrompt if defined
    if (objective?.customPrompt) {
      prompt += `\n\nADDITIONAL FOCUS (user-defined):\n${objective.customPrompt}`;
    }

    // Inject attendeeRoles if defined
    if (objective?.attendeeRoles?.length) {
      const roleContext = objective.attendeeRoles
        .map(role => `- ${role}: Tailor talking points for this role`)
        .join('\n');
      prompt += `\n\nEXPECTED ATTENDEE ROLES:\n${roleContext}`;
    }

    // Inject objectives as success criteria
    if (objective?.objectives?.length) {
      const objectiveList = objective.objectives
        .map((obj, i) => `${i + 1}. ${obj}`)
        .join('\n');
      prompt += `\n\nMEETING SUCCESS CRITERIA:\n${objectiveList}`;
    }

    return prompt;
  }

  /**
   * Infer meeting objective from calendar, CRM, and historical signals
   * Used for hybrid mode: system suggests, user can override
   */
  async inferMeetingObjective(
    calendarEvent: CalendarEvent | null,
    attendees: string[],
    crmData: CRMContactData[],
    pastMeetings: Meeting[]
  ): Promise<InferredObjective> {
    const { aiProvider } = getContainer();

    // Build signals for inference
    const signals = {
      // Calendar signals
      title: calendarEvent?.title || '',
      duration: calendarEvent?.end && calendarEvent?.start
        ? (new Date(calendarEvent.end).getTime() - new Date(calendarEvent.start).getTime()) / 60000
        : 30,
      isRecurring: calendarEvent?.title?.toLowerCase().includes('weekly') ||
                   calendarEvent?.title?.toLowerCase().includes('sync') || false,
      attendeeCount: attendees.length,

      // CRM signals
      dealStages: crmData.map(c => c.deals?.[0]?.dealStage).filter(Boolean),
      contactRoles: crmData.map(c => c.jobTitle).filter(Boolean),
      hasActiveDeals: crmData.some(c => c.deals && c.deals.length > 0),

      // Historical signals
      pastMeetingCount: pastMeetings.length,
      recentTopics: pastMeetings.slice(0, 3).map(m => m.title).filter(Boolean),
    };

    // If no AI provider, use heuristic inference
    if (!aiProvider) {
      return this.inferObjectiveHeuristically(signals);
    }

    const prompt = `Based on these meeting signals, infer the most likely meeting objective type.

SIGNALS:
${JSON.stringify(signals, null, 2)}

OBJECTIVE TYPES to choose from:
- "deal_progression": Sales-focused, moving a deal forward
- "relationship_check": Maintaining/strengthening relationship
- "technical_review": Technical discussion, implementation, integration
- "project_update": Status update, milestone review
- "problem_solving": Issue resolution, troubleshooting
- "discovery": Initial conversation, learning about needs
- "onboarding": New customer/user training
- "general": Generic meeting, unclear objective

Return JSON only:
{
  "suggestedType": "one of the types above",
  "confidence": 0-100,
  "reasoning": "brief explanation"
}`;

    try {
      const response = await aiProvider.chat(
        [{ role: 'user', content: prompt }],
        { model: 'gpt-4o', temperature: 0.3, maxTokens: 200, responseFormat: 'json' }
      );

      const parsed = JSON.parse(response);
      return {
        suggestedType: parsed.suggestedType || 'general',
        confidence: parsed.confidence || 50,
        reasoning: parsed.reasoning || 'Inferred from available signals',
        userCanOverride: true,
      };
    } catch (error) {
      logger.warn('Failed to infer objective with AI, using heuristics', { error });
      return this.inferObjectiveHeuristically(signals);
    }
  }

  /**
   * Heuristic objective inference (fallback when AI unavailable)
   */
  private inferObjectiveHeuristically(signals: {
    title: string;
    dealStages: (string | undefined)[];
    hasActiveDeals: boolean;
    pastMeetingCount: number;
    isRecurring: boolean;
  }): InferredObjective {
    const titleLower = signals.title.toLowerCase();

    // Check title for hints
    if (titleLower.includes('onboard') || titleLower.includes('training')) {
      return { suggestedType: 'onboarding', confidence: 80, reasoning: 'Title mentions onboarding/training', userCanOverride: true };
    }
    if (titleLower.includes('demo') || titleLower.includes('discovery')) {
      return { suggestedType: 'discovery', confidence: 75, reasoning: 'Title suggests discovery/demo', userCanOverride: true };
    }
    if (titleLower.includes('technical') || titleLower.includes('integration') || titleLower.includes('api')) {
      return { suggestedType: 'technical_review', confidence: 75, reasoning: 'Title mentions technical topics', userCanOverride: true };
    }
    if (titleLower.includes('issue') || titleLower.includes('problem') || titleLower.includes('urgent')) {
      return { suggestedType: 'problem_solving', confidence: 70, reasoning: 'Title suggests issue resolution', userCanOverride: true };
    }
    if (titleLower.includes('update') || titleLower.includes('status') || titleLower.includes('review')) {
      return { suggestedType: 'project_update', confidence: 65, reasoning: 'Title suggests status update', userCanOverride: true };
    }

    // Check CRM context
    if (signals.hasActiveDeals && signals.dealStages.some(s => s?.toLowerCase().includes('negotiation'))) {
      return { suggestedType: 'deal_progression', confidence: 70, reasoning: 'Active deal in negotiation stage', userCanOverride: true };
    }

    // Check history
    if (signals.pastMeetingCount === 0) {
      return { suggestedType: 'discovery', confidence: 60, reasoning: 'First meeting with this contact', userCanOverride: true };
    }
    if (signals.isRecurring && signals.pastMeetingCount >= 3) {
      return { suggestedType: 'relationship_check', confidence: 60, reasoning: 'Recurring meeting with established contact', userCanOverride: true };
    }

    return { suggestedType: 'general', confidence: 40, reasoning: 'Insufficient signals for specific inference', userCanOverride: true };
  }

  /**
   * Calculate unified signal scores (role-agnostic)
   * All signals start with equal weight, adjusted by feedback
   */
  calculateSignals(
    calendar: CalendarEvent | null,
    crm: CRMContactData | null,
    meetings: Meeting[],
    feedbackWeights: Record<string, number>
  ): SignalScore[] {
    const signals: SignalScore[] = [];

    // Calendar signals
    if (calendar) {
      const durationMinutes = calendar.end && calendar.start
        ? (new Date(calendar.end).getTime() - new Date(calendar.start).getTime()) / 60000
        : 30;

      signals.push({
        source: 'calendar',
        category: 'duration',
        rawValue: durationMinutes,
        normalizedScore: Math.min(durationMinutes / 60, 1),
        weight: feedbackWeights['duration'] ?? 1.0,
      });

      signals.push({
        source: 'calendar',
        category: 'attendee_count',
        rawValue: calendar.attendees?.length || 0,
        normalizedScore: Math.min((calendar.attendees?.length || 0) / 10, 1),
        weight: feedbackWeights['attendee_count'] ?? 1.0,
      });
    }

    // CRM signals
    if (crm?.deals?.[0]) {
      signals.push({
        source: 'crm',
        category: 'deal_value',
        rawValue: crm.deals[0].dealValue || 0,
        normalizedScore: Math.min((crm.deals[0].dealValue || 0) / 100000, 1),
        weight: feedbackWeights['deal_value'] ?? 1.0,
      });

      signals.push({
        source: 'crm',
        category: 'deal_stage',
        rawValue: crm.deals[0].dealStage,
        normalizedScore: this.dealStageToScore(crm.deals[0].dealStage),
        weight: feedbackWeights['deal_stage'] ?? 1.0,
      });
    }

    // Meeting signals
    if (meetings.length > 0) {
      const lastMeeting = meetings[0];
      const daysSince = Math.floor(
        (Date.now() - new Date(lastMeeting.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      signals.push({
        source: 'meetings',
        category: 'recency',
        rawValue: daysSince,
        normalizedScore: Math.max(1 - (daysSince / 90), 0),
        weight: feedbackWeights['recency'] ?? 1.0,
      });

      signals.push({
        source: 'meetings',
        category: 'frequency',
        rawValue: meetings.length,
        normalizedScore: Math.min(meetings.length / 10, 1),
        weight: feedbackWeights['frequency'] ?? 1.0,
      });
    }

    return signals;
  }

  /**
   * Convert deal stage to normalized score
   */
  private dealStageToScore(stage: string | undefined): number {
    if (!stage) return 0;
    const stageLower = stage.toLowerCase();

    // Later stages = higher urgency
    if (stageLower.includes('closed') || stageLower.includes('won')) return 1.0;
    if (stageLower.includes('negotiation') || stageLower.includes('contract')) return 0.9;
    if (stageLower.includes('proposal') || stageLower.includes('quote')) return 0.7;
    if (stageLower.includes('demo') || stageLower.includes('qualified')) return 0.5;
    if (stageLower.includes('discovery') || stageLower.includes('lead')) return 0.3;
    return 0.2;
  }

  /**
   * Compute composite priority from signals
   */
  computePriority(signals: SignalScore[]): number {
    if (signals.length === 0) return 50;

    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const weightedSum = signals.reduce((sum, s) => sum + (s.normalizedScore * s.weight), 0);
    return Math.round((weightedSum / totalWeight) * 100);
  }

  /**
   * Generate dynamic prep with insights that appear based on relevance
   */
  async generateDynamicPrep(
    input: GenerateMeetingPrepInput & {
      objective?: CustomMeetingType | null;
      calendarEvent?: CalendarEvent | null;
      feedbackWeights?: Record<string, number>;
    }
  ): Promise<DynamicPrepResult> {
    logger.info('Generating dynamic prep', {
      meetingType: input.meeting.meeting_type,
      participantCount: input.participants.length,
      hasObjective: !!input.objective,
    });

    const { aiProvider, meetingRepo, settingsRepo, hubSpotService, salesforceService } = getContainer();
    if (!aiProvider) throw new Error('AI provider not available');
    if (!meetingRepo) throw new Error('Meeting repository not available');

    const settings = settingsRepo?.getSettings();
    const feedbackWeights = input.feedbackWeights || {};
    const participants: DynamicPrepParticipant[] = [];

    for (const participant of input.participants) {
      const dynamicParticipant = await this.buildDynamicParticipant(
        participant,
        input.objective || null,
        input.calendarEvent || null,
        feedbackWeights,
        meetingRepo,
        aiProvider,
        settings,
        hubSpotService,
        salesforceService
      );
      participants.push(dynamicParticipant);
    }

    // Sort by computed priority
    participants.sort((a, b) => b.computedPriority - a.computedPriority);

    // Generate multi-person synthesis for 2+ participants
    let synthesis: MeetingSynthesis | undefined;
    if (participants.length >= 2) {
      synthesis = await this.generateMultiPersonSynthesis(
        participants,
        input.meeting.objective || input.meeting.meeting_type,
        meetingRepo,
        aiProvider
      );
    }

    // Infer objective if not provided
    let inferred = false;
    let meetingType = input.meeting.meeting_type;
    if (!input.objective && input.calendarEvent) {
      const crmData = await Promise.all(
        input.participants
          .filter(p => p.email)
          .map(p => this.fetchCRMData(p.email!, settings, hubSpotService, salesforceService))
      );
      const allMeetings = meetingRepo.findAll();
      const inferredObj = await this.inferMeetingObjective(
        input.calendarEvent,
        input.participants.map(p => p.email).filter(Boolean) as string[],
        crmData.filter(Boolean) as CRMContactData[],
        allMeetings
      );
      if (inferredObj.confidence >= 50) {
        meetingType = inferredObj.suggestedType;
        inferred = true;
      }
    }

    return {
      meeting: {
        type: meetingType,
        objective: input.meeting.objective,
        inferred,
      },
      generatedAt: new Date().toISOString(),
      participants,
      synthesis,
    };
  }

  /**
   * Generate multi-person synthesis for cross-participant analysis
   */
  private async generateMultiPersonSynthesis(
    participants: DynamicPrepParticipant[],
    objective: string,
    meetingRepo: any,
    aiProvider: any
  ): Promise<MeetingSynthesis> {
    const allMeetings = meetingRepo.findAll();

    // Detect relationship type based on email domains
    const relationshipType = this.detectRelationshipType(participants);

    // Build context for each participant
    const participantContexts = participants.map(p => {
      const participantMeetings = this.filterMeetingsByParticipant(
        allMeetings,
        { name: p.name, email: p.email, company: null, domain: p.email?.split('@')[1] || null }
      ).slice(0, 5); // Last 5 meetings

      const recentMeetings = participantMeetings.map(m => ({
        title: m.title,
        date: new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        summary: m.summary || m.overview || '',
      }));

      return {
        name: p.name,
        email: p.email,
        recentMeetings,
        topics: recentMeetings.map(m => m.title).join(', '),
        lastMeeting: recentMeetings[0]?.date || 'Never',
      };
    });

    // Find shared meetings (meetings where 2+ participants were present)
    const sharedMeetings = this.findSharedMeetings(allMeetings, participants);

    // Build the synthesis prompt
    const prompt = this.buildSynthesisPrompt(
      participantContexts,
      sharedMeetings,
      objective,
      relationshipType
    );

    try {
      const response = await aiProvider.chat(
        [{ role: 'user', content: prompt }],
        { model: 'gpt-4o', temperature: 0.4, maxTokens: 800, responseFormat: 'json' }
      );

      const parsed = JSON.parse(response);
      return {
        likelyTopics: parsed.likelyTopics || [],
        connectingThreads: parsed.connectingThreads || [],
        relationshipType,
        forwardActions: parsed.forwardActions || [],
      };
    } catch (error) {
      logger.error('Error generating multi-person synthesis', { error });
      // Return minimal synthesis on error
      return {
        likelyTopics: [],
        connectingThreads: [],
        relationshipType,
        forwardActions: ['Review individual participant context before the meeting'],
      };
    }
  }

  /**
   * Detect relationship type between participants based on email domains
   */
  private detectRelationshipType(
    participants: DynamicPrepParticipant[]
  ): 'teammates' | 'cross-functional' | 'external' | 'unknown' {
    const domains = participants
      .map(p => p.email?.split('@')[1])
      .filter(Boolean) as string[];

    if (domains.length === 0) return 'unknown';

    const uniqueDomains = new Set(domains);
    if (uniqueDomains.size === 1) return 'teammates';
    if (uniqueDomains.size === domains.length) return 'external';
    return 'cross-functional';
  }

  /**
   * Find meetings where 2+ prep participants were present
   */
  private findSharedMeetings(
    allMeetings: Meeting[],
    participants: DynamicPrepParticipant[]
  ): Array<{ title: string; date: string; participantsPresent: string[] }> {
    const sharedMeetings: Array<{ title: string; date: string; participantsPresent: string[] }> = [];

    for (const meeting of allMeetings) {
      const presentParticipants: string[] = [];

      for (const p of participants) {
        const found = this.filterMeetingsByParticipant(
          [meeting],
          { name: p.name, email: p.email, company: null, domain: p.email?.split('@')[1] || null }
        );
        if (found.length > 0) {
          presentParticipants.push(p.name);
        }
      }

      if (presentParticipants.length >= 2) {
        sharedMeetings.push({
          title: meeting.title,
          date: new Date(meeting.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          participantsPresent: presentParticipants,
        });
      }
    }

    return sharedMeetings.slice(0, 5); // Limit to 5 most recent
  }

  /**
   * Build the AI prompt for multi-person synthesis
   */
  private buildSynthesisPrompt(
    participantContexts: Array<{
      name: string;
      email: string | null;
      recentMeetings: Array<{ title: string; date: string; summary: string }>;
      topics: string;
      lastMeeting: string;
    }>,
    sharedMeetings: Array<{ title: string; date: string; participantsPresent: string[] }>,
    objective: string,
    relationshipType: string
  ): string {
    const participantsSection = participantContexts
      .map((p, i) => {
        const meetingsList = p.recentMeetings
          .map(m => `  - "${m.title}" (${m.date})${m.summary ? ': ' + m.summary.substring(0, 100) : ''}`)
          .join('\n');
        return `${i + 1}. ${p.name}${p.email ? ` (${p.email})` : ''}
   Recent topics: ${p.topics || 'No recent meetings'}
   Last meeting: ${p.lastMeeting}
   Recent meetings:\n${meetingsList || '  - None'}`;
      })
      .join('\n\n');

    const sharedSection = sharedMeetings.length > 0
      ? sharedMeetings.map(m => `- "${m.title}" (${m.date}) - ${m.participantsPresent.join(', ')}`).join('\n')
      : 'None - first time meeting together';

    const relationshipGuidance = {
      teammates: 'Focus on shared projects, internal handoffs, team dynamics, and collaboration patterns.',
      'cross-functional': 'Look for project overlaps, handoff points, dependencies between their work areas.',
      external: 'Focus on business relationship, deal progression, mutual value exchange, and partnership dynamics.',
      unknown: 'Analyze based on meeting context and any available information.',
    }[relationshipType];

    return `You are analyzing why these people might be meeting together.

Meeting objective: ${objective}
Relationship type: ${relationshipType}

Participants:
${participantsSection}

Shared meeting history:
${sharedSection}

Guidelines:
- ${relationshipGuidance}
- Include inline meeting citations in rationale, e.g., "discussed in Q4 Planning (Dec 15)"
- If no shared meetings, look for connecting threads from their separate meeting histories
- Forward actions should be specific, actionable preparation points

Generate JSON (no markdown, raw JSON only):
{
  "likelyTopics": [
    {
      "topic": "Brief topic title",
      "rationale": "Why this is likely - include inline meeting citations"
    }
  ],
  "connectingThreads": ["How these people connect through their work"],
  "forwardActions": ["Specific preparation action 1", "Action 2", "Action 3"]
}

Include 2-4 likely topics, 2-3 connecting threads, and 3-5 forward actions.`;
  }

  /**
   * Build dynamic participant with signals and brief
   */
  private async buildDynamicParticipant(
    participant: PrepParticipant,
    objective: CustomMeetingType | null,
    calendarEvent: CalendarEvent | null,
    feedbackWeights: Record<string, number>,
    meetingRepo: any,
    aiProvider: any,
    settings: any,
    hubSpotService: any,
    salesforceService: any
  ): Promise<DynamicPrepParticipant> {
    const email = participant.email;

    // Get past meetings
    const allMeetings = meetingRepo.findAll();
    const participantMeetings = this.filterMeetingsByParticipant(allMeetings, participant)
      .sort((a: Meeting, b: Meeting) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const isFirstMeeting = participantMeetings.length === 0;

    // Fetch CRM data
    let crmData: CRMContactData | null = null;
    if (email) {
      crmData = await this.fetchCRMData(email, settings, hubSpotService, salesforceService);
    }

    // Calculate signals
    const signals = this.calculateSignals(calendarEvent, crmData, participantMeetings, feedbackWeights);
    const computedPriority = this.computePriority(signals);

    // Build pending actions
    const actionItems = this.buildActionItems(participantMeetings, email);
    const pendingActions: PendingActions = {
      theyOweUs: actionItems.filter(a => a.assignedTo === 'them' && !a.completed),
      weOweThem: actionItems.filter(a => a.assignedTo === 'us' && !a.completed),
    };

    // Cross-validate against CRM
    const crmValidations = await this.validateAgainstCRM(participantMeetings, crmData);

    // Generate dynamic brief
    const brief = await this.generateDynamicBrief(
      participant,
      signals,
      pendingActions,
      crmValidations,
      crmData,
      participantMeetings,
      objective,
      aiProvider
    );

    // Build other context (reuse existing methods)
    const lastSeen = this.buildLastSeenContext(participantMeetings, aiProvider);
    const intel = await this.buildParticipantIntel(participant, participantMeetings, crmData, aiProvider);
    const timeline = this.buildTimeline(participantMeetings, crmData);
    const crmSnapshot = crmData?.deals?.[0] || undefined;
    const confidence = this.calculateConfidence(participantMeetings, crmData);

    return {
      name: participant.name,
      email: participant.email,
      signals,
      computedPriority,
      brief,
      pendingActions,
      crmValidations,
      lastSeen: lastSeen || undefined,
      intel,
      timeline,
      crmSnapshot,
      confidence,
      isFirstMeeting,
    };
  }

  /**
   * Cross-validate meeting claims against CRM data
   */
  async validateAgainstCRM(
    meetings: Meeting[],
    crmData: CRMContactData | null
  ): Promise<CRMValidation[]> {
    if (!crmData || meetings.length === 0) return [];

    const validations: CRMValidation[] = [];
    const { aiProvider } = getContainer();
    if (!aiProvider) return [];

    // Get recent meeting content
    const recentMeeting = meetings[0];
    const meetingText = [
      recentMeeting.title,
      recentMeeting.summary,
      recentMeeting.actionItems?.join('. ')
    ].filter(Boolean).join(' ');

    if (meetingText.length < 50) return [];

    const prompt = `Extract factual claims from this meeting content that can be validated against CRM data.

MEETING CONTENT:
${meetingText.substring(0, 1500)}

CRM DATA:
- Deal Stage: ${crmData.deals?.[0]?.dealStage || 'No deal'}
- Deal Value: ${crmData.deals?.[0]?.dealValue || 'N/A'}
- Close Date: ${crmData.deals?.[0]?.closeDate || 'N/A'}
- Contact Role: ${crmData.role || crmData.jobTitle || 'Unknown'}

Look for discrepancies between what was discussed in the meeting and what the CRM shows.
Only report CLEAR discrepancies, not minor differences.

Return JSON:
{
  "discrepancies": [
    {
      "field": "deal_stage|close_date|deal_value|decision_maker",
      "meetingClaim": "what meeting said",
      "crmValue": "what CRM shows",
      "note": "explanation"
    }
  ]
}

If no discrepancies, return: { "discrepancies": [] }`;

    try {
      const response = await aiProvider.chat(
        [{ role: 'user', content: prompt }],
        { model: 'gpt-4o', temperature: 0.2, maxTokens: 400, responseFormat: 'json' }
      );

      const parsed = JSON.parse(response);
      for (const d of parsed.discrepancies || []) {
        validations.push({
          field: d.field,
          meetingClaim: d.meetingClaim,
          crmValue: d.crmValue,
          matches: false,
          discrepancyNote: d.note,
        });
      }
    } catch (error) {
      logger.warn('CRM validation failed', { error });
    }

    return validations;
  }

  /**
   * Generate dynamic brief with sections that appear based on relevance
   */
  private async generateDynamicBrief(
    participant: PrepParticipant,
    signals: SignalScore[],
    pendingActions: PendingActions,
    crmValidations: CRMValidation[],
    crmData: CRMContactData | null,
    meetings: Meeting[],
    objective: CustomMeetingType | null,
    aiProvider: any
  ): Promise<DynamicBrief> {
    const insights: PrepInsight[] = [];

    // Add CRM discrepancy insights (highest priority if present)
    if (crmValidations.length > 0) {
      for (const validation of crmValidations) {
        insights.push({
          id: `discrepancy-${validation.field}`,
          category: 'heads_up',
          content: validation.discrepancyNote || `${validation.field}: Meeting said "${validation.meetingClaim}" but CRM shows "${validation.crmValue}"`,
          priority: 95,
          source: 'crm',
          actionable: true,
        });
      }
    }

    // Add pending action insights (only if present)
    if (pendingActions.theyOweUs.length > 0) {
      insights.push({
        id: 'pending-them',
        category: 'pending_action',
        content: `Waiting on them: ${pendingActions.theyOweUs.slice(0, 3).map(a => a.description).join('; ')}`,
        priority: 90,
        source: 'meetings',
        actionable: true,
      });
    }
    if (pendingActions.weOweThem.length > 0) {
      insights.push({
        id: 'pending-us',
        category: 'pending_action',
        content: `You owe them: ${pendingActions.weOweThem.slice(0, 3).map(a => a.description).join('; ')}`,
        priority: 85,
        source: 'meetings',
        actionable: true,
      });
    }

    // Add deal insight (only if deal exists and is active)
    if (crmData?.deals?.[0] && !crmData.deals[0].dealStage?.toLowerCase().includes('closed')) {
      const deal = crmData.deals[0];
      insights.push({
        id: 'deal-context',
        category: 'deal',
        content: `Deal: ${deal.dealName || 'Unnamed'} - ${deal.dealStage}${deal.dealValue ? ` ($${deal.dealValue.toLocaleString()})` : ''}`,
        priority: 70,
        source: 'crm',
        actionable: false,
        metadata: { dealStage: deal.dealStage, dealValue: deal.dealValue },
      });
    }

    // Add activity gap insight (only if significant gap)
    if (meetings.length > 0) {
      const lastMeeting = meetings[0];
      const daysSince = Math.floor(
        (Date.now() - new Date(lastMeeting.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince > 30) {
        insights.push({
          id: 'activity-gap',
          category: 'heads_up',
          content: `No meeting in ${daysSince} days - consider re-establishing rapport`,
          priority: 75,
          source: 'meetings',
          actionable: true,
        });
      }
    }

    // Add first meeting insight
    if (meetings.length === 0) {
      insights.push({
        id: 'first-meeting',
        category: 'context',
        content: `First meeting with ${participant.name}${participant.company ? ` from ${participant.company}` : ''}`,
        priority: 80,
        source: 'inferred',
        actionable: false,
      });
    }

    // Sort by priority
    insights.sort((a, b) => b.priority - a.priority);

    // Generate headline and suggested actions via AI
    const briefSummary = await this.generateBriefSummary(
      participant,
      insights,
      signals,
      meetings,  // Pass meeting history for context!
      objective,
      aiProvider
    );

    return {
      headline: briefSummary.headline,
      insights: insights.filter(i => i.priority >= 50), // Only show high-priority
      suggestedActions: briefSummary.suggestedActions,
      bottomLine: briefSummary.bottomLine,
    };
  }

  /**
   * Record feedback on an insight and update weights
   */
  async recordInsightFeedback(
    insightId: string,
    insightCategory: string,
    feedback: 'useful' | 'not_useful' | 'dismissed',
    participantEmail?: string
  ): Promise<void> {
    const { settingsRepo } = getContainer();
    if (!settingsRepo) return;

    logger.info('Recording insight feedback', { insightId, insightCategory, feedback });

    // Get current weights from settings (or use defaults)
    const settings = settingsRepo.getSettings();
    const currentWeights: Record<string, SignalWeight> = (settings as any).signalWeights || {};

    // Get or create weight entry for this category
    const existingWeight = currentWeights[insightCategory] || {
      id: `weight-${insightCategory}`,
      category: insightCategory,
      weight: 1.0,
      sampleCount: 0,
      updatedAt: new Date().toISOString(),
    };

    // Update weight based on feedback
    // Useful = increase weight, not_useful/dismissed = decrease weight
    const adjustment = feedback === 'useful' ? 0.1 : -0.1;
    const newWeight = Math.max(0.1, Math.min(2.0, existingWeight.weight + adjustment));

    currentWeights[insightCategory] = {
      ...existingWeight,
      weight: newWeight,
      sampleCount: existingWeight.sampleCount + 1,
      updatedAt: new Date().toISOString(),
    };

    // Persist to settings
    settingsRepo.updateSettings({
      ...settings,
      signalWeights: currentWeights,
    } as any);

    logger.info('Updated signal weight', {
      category: insightCategory,
      oldWeight: existingWeight.weight,
      newWeight,
      sampleCount: existingWeight.sampleCount + 1,
    });
  }

  /**
   * Get learned feedback weights from settings
   */
  getFeedbackWeights(): Record<string, number> {
    const { settingsRepo } = getContainer();
    if (!settingsRepo) return {};

    const settings = settingsRepo.getSettings();
    const signalWeights: Record<string, SignalWeight> = (settings as any).signalWeights || {};

    // Convert SignalWeight objects to simple weight values
    const weights: Record<string, number> = {};
    for (const [category, sw] of Object.entries(signalWeights)) {
      // Only use weights with enough samples (at least 5)
      if (sw.sampleCount >= 5) {
        weights[category] = sw.weight;
      }
    }

    return weights;
  }

  /**
   * Reset all learned weights to defaults
   */
  resetFeedbackWeights(): void {
    const { settingsRepo } = getContainer();
    if (!settingsRepo) return;

    const settings = settingsRepo.getSettings();
    settingsRepo.updateSettings({
      ...settings,
      signalWeights: {},
    } as any);

    logger.info('Reset all signal weights to defaults');
  }

  /**
   * Generate headline, suggested actions, and bottom line via AI
   */
  private async generateBriefSummary(
    participant: PrepParticipant,
    insights: PrepInsight[],
    signals: SignalScore[],
    meetings: Meeting[],  // Added: meeting history for context
    objective: CustomMeetingType | null,
    aiProvider: any
  ): Promise<{ headline: string; suggestedActions: string[]; bottomLine: string }> {
    const insightSummary = insights
      .slice(0, 5)
      .map(i => `[${i.category}] ${i.content}`)
      .join('\n');

    const signalSummary = signals
      .filter(s => s.normalizedScore > 0.3)
      .map(s => `${s.category}: ${s.normalizedScore.toFixed(2)}`)
      .join(', ');

    // Build meeting history context - THIS IS CRITICAL
    const meetingHistoryContext = meetings.slice(0, 5).map((m, i) => {
      const date = new Date(m.createdAt);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const dateStr = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;

      const parts = [`Meeting ${i + 1} (${dateStr}): "${m.title}"`];
      if (m.summary) parts.push(`Summary: ${m.summary.substring(0, 300)}`);
      if (m.overview) parts.push(`Overview: ${m.overview.substring(0, 200)}`);
      if (m.actionItems && m.actionItems.length > 0) {
        parts.push(`Action items: ${m.actionItems.slice(0, 3).join('; ')}`);
      }
      return parts.join('\n  ');
    }).join('\n\n');

    const prompt = `Generate a 30-second brief for meeting with ${participant.name}${participant.company ? ` from ${participant.company}` : ''}.

MEETING HISTORY WITH THIS PERSON:
${meetingHistoryContext || 'No previous meetings recorded'}

CURRENT INSIGHTS:
${insightSummary || 'No specific insights available'}

IMPORTANCE SIGNALS:
${signalSummary || 'No strong signals'}

MEETING OBJECTIVE:
${objective?.name || 'General meeting'}
${objective?.objectives?.length ? `Success criteria: ${objective.objectives.join(', ')}` : ''}

Based on the meeting history above, generate personalized content:
1. HEADLINE: One sentence summarizing the relationship status and what's most important (max 15 words). Reference specific topics/issues from past meetings if available.
2. SUGGESTED_ACTIONS: 3-4 specific, personalized actions for this meeting based on past context. Reference specific topics, pending items, or unresolved issues from history.
3. BOTTOM_LINE: What success looks like based on the relationship history (one sentence)

Return JSON:
{
  "headline": "string",
  "suggestedActions": ["string"],
  "bottomLine": "string"
}`;

    try {
      const response = await aiProvider.chat(
        [{ role: 'user', content: prompt }],
        { model: 'gpt-4o', temperature: 0.4, maxTokens: 300, responseFormat: 'json' }
      );

      return JSON.parse(response);
    } catch (error) {
      logger.warn('Brief summary generation failed', { error });
      return {
        headline: `Meeting with ${participant.name}`,
        suggestedActions: ['Review pending items', 'Discuss next steps', 'Confirm follow-ups'],
        bottomLine: 'Align on priorities and next steps',
      };
    }
  }

  // ============================================================
  // CONVERSATIONAL PREP - Granola-style natural output
  // ============================================================

  private readonly BANNED_PHRASES = [
    'explore opportunities',
    'discuss synergies',
    'align on priorities',
    'touch base',
    'circle back',
    'leverage',
    'best practices',
    'going forward',
    'at the end of the day',
    'move the needle',
    'low-hanging fruit',
    'deep dive',
    'synergize',
    'paradigm shift',
    'circle back',
  ];

  // ============================================================
  // QUERY INTELLIGENCE SYSTEM
  // ============================================================

  /**
   * Get current user context from settings
   * Used to personalize responses based on who's asking
   */
  getUserContext(): UserContext {
    const { settingsRepo } = getContainer();
    const settings = settingsRepo?.getSettings();
    const profile = settings?.userProfile;

    return {
      name: profile?.name || null,
      email: profile?.email || null,
      position: profile?.position || null,
      company: profile?.company || null,
    };
  }

  /**
   * Check if the current user was an attendee of a meeting
   */
  private wasUserAttendee(meeting: Meeting, userContext: UserContext): boolean {
    if (!userContext.email) return false;
    const userEmail = userContext.email.toLowerCase();

    // Check attendeeEmails
    if (meeting.attendeeEmails?.some(e => e.toLowerCase() === userEmail)) {
      return true;
    }

    // Check participants (deprecated but still used)
    if (meeting.participants?.some(p => p.toLowerCase().includes(userEmail))) {
      return true;
    }

    return false;
  }

  /**
   * Classify query type to determine optimal response strategy
   * - retrieval: Factual questions about past meetings → strict citations, lower temperature
   * - generative: Creative tasks (write email, draft message) → higher temperature, light citations
   * - hybrid: Both retrieval and generation needed → balanced approach
   */
  classifyQueryType(message: string): ClassifiedQuery {
    const lowerMessage = message.toLowerCase();

    // Check for greetings first
    if (isGreeting(message)) {
      return {
        type: 'greeting',
        originalMessage: message,
        searchTerms: [],
        confidence: 1.0,
        reasoning: 'Message is a greeting',
      };
    }

    // Generative patterns - user wants content created
    const generativePatterns = [
      /write\s+(?:an?\s+)?(?:email|message|note|summary|response|reply)/i,
      /draft\s+(?:an?\s+)?(?:email|message|note|response)/i,
      /compose\s+(?:an?\s+)?/i,
      /create\s+(?:an?\s+)?(?:email|message|outline|agenda)/i,
      /help\s+me\s+(?:write|draft|compose)/i,
      /suggest\s+(?:how\s+to|what\s+to)\s+(?:say|write|respond)/i,
      /what\s+should\s+i\s+(?:say|write|tell)/i,
    ];

    // Retrieval patterns - user wants facts from past meetings
    const retrievalPatterns = [
      /what\s+(?:was|were|did|has|have)\s+(?:decided|discussed|said|mentioned|agreed)/i,
      /when\s+(?:did|was|were)/i,
      /who\s+(?:said|mentioned|agreed|decided|promised)/i,
      /did\s+(?:we|they|i)\s+(?:discuss|talk|mention|agree|decide)/i,
      /what\s+(?:is|are)\s+the\s+(?:status|update|decision|outcome)/i,
      /summarize\s+(?:the|our|my)\s+(?:meeting|discussion|conversation)/i,
      /what\s+happened\s+(?:in|during|at)/i,
      /find\s+(?:the|any|all)\s+(?:meeting|discussion|conversation)/i,
      /search\s+for/i,
      /look\s+up/i,
    ];

    // Check for generative intent
    const isGenerative = generativePatterns.some(p => p.test(message));

    // Check for retrieval intent
    const isRetrieval = retrievalPatterns.some(p => p.test(message));

    // Determine query type
    let type: QueryType;
    let confidence: number;
    let reasoning: string;

    if (isGenerative && isRetrieval) {
      type = 'hybrid';
      confidence = 0.8;
      reasoning = 'Query contains both generative (write/draft) and retrieval (what was/find) patterns';
    } else if (isGenerative) {
      type = 'generative';
      confidence = 0.85;
      reasoning = 'Query requests content creation (write, draft, compose)';
    } else if (isRetrieval) {
      type = 'retrieval';
      confidence = 0.9;
      reasoning = 'Query seeks factual information from past meetings';
    } else {
      // Default to hybrid for ambiguous queries
      type = 'hybrid';
      confidence = 0.6;
      reasoning = 'No strong signals detected, defaulting to balanced approach';
    }

    // Parse date range if present
    const dateRange = this.parseDateRange(message);

    // Extract search terms
    const searchTerms = this.extractSearchTerms(message);

    return {
      type,
      originalMessage: message,
      searchTerms,
      dateRange,
      confidence,
      reasoning,
    };
  }

  /**
   * Parse natural language date expressions from message
   * Uses chrono-node for robust date parsing
   */
  private parseDateRange(message: string): ClassifiedQuery['dateRange'] | undefined {
    const now = new Date();

    // Use chrono-node to parse dates
    const parsed = chrono.parse(message, now, { forwardDate: false });

    if (parsed.length === 0) {
      return undefined;
    }

    // Get the first parsed result
    const result = parsed[0];

    // Extract the matched text as the description
    const description = result.text;

    // Handle range expressions (e.g., "from Monday to Friday")
    if (result.start && result.end) {
      return {
        start: result.start.date(),
        end: result.end.date(),
        description,
      };
    }

    // Handle single date expressions
    if (result.start) {
      const startDate = result.start.date();

      // For expressions like "last week", "yesterday", create appropriate range
      if (description.includes('week')) {
        // Expand to full week
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        return { start: weekStart, end: weekEnd, description };
      } else if (description.includes('month')) {
        // Expand to full month
        const monthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const monthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start: monthStart, end: monthEnd, description };
      } else {
        // Single day - expand to full day
        const dayStart = new Date(startDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(startDate);
        dayEnd.setHours(23, 59, 59, 999);
        return { start: dayStart, end: dayEnd, description };
      }
    }

    return undefined;
  }

  /**
   * Extract meaningful search terms from a message
   */
  private extractSearchTerms(message: string): string[] {
    const stopWords = new Set([
      'search', 'find', 'look', 'for', 'up', 'the', 'a', 'an', 'with', 'about',
      'meeting', 'meetings', 'what', 'when', 'where', 'who', 'how', 'why',
      'did', 'was', 'were', 'is', 'are', 'has', 'have', 'had', 'do', 'does',
      'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might',
      'i', 'we', 'you', 'they', 'he', 'she', 'it', 'me', 'us', 'them',
      'my', 'our', 'your', 'their', 'his', 'her', 'its',
      'in', 'on', 'at', 'to', 'from', 'by', 'of', 'and', 'or', 'but',
      'that', 'this', 'these', 'those', 'any', 'all', 'some', 'no',
      'tell', 'show', 'give', 'help', 'need', 'want', 'please',
    ]);

    return message
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Get temperature setting based on query type
   */
  private getTemperatureForQueryType(queryType: QueryType): number {
    switch (queryType) {
      case 'retrieval':
        return 0.3; // Lower temperature for factual accuracy
      case 'generative':
        return 0.7; // Higher temperature for creativity
      case 'hybrid':
      default:
        return 0.5; // Balanced
    }
  }

  /**
   * Filter meetings by date range
   */
  private filterMeetingsByDateRange(
    meetings: Meeting[],
    dateRange: ClassifiedQuery['dateRange']
  ): Meeting[] {
    if (!dateRange || (!dateRange.start && !dateRange.end)) {
      return meetings;
    }

    return meetings.filter(m => {
      const meetingDate = new Date(m.createdAt);

      if (dateRange.start && meetingDate < dateRange.start) {
        return false;
      }
      if (dateRange.end && meetingDate > dateRange.end) {
        return false;
      }
      return true;
    });
  }

  /**
   * Generate conversational prep (Granola-style)
   * Single input: person name/email → conversational markdown output
   */
  async generateConversationalPrep(input: QuickPrepInput): Promise<ConversationalPrepResult> {
    const startTime = Date.now();
    logger.info('Generating conversational prep', { personQuery: input.personQuery });

    const { aiProvider, meetingRepo } = getContainer();
    if (!aiProvider) throw new Error('AI provider not available');
    if (!meetingRepo) throw new Error('Meeting repository not available');

    // Step 1: Find the person
    const person = await this.findPersonByQuery(input.personQuery);
    if (!person) {
      throw new Error(`No person found matching "${input.personQuery}"`);
    }

    // Step 2: Get relevant meetings (time-weighted)
    const meetings = await this.getWeightedMeetingsForPerson(person);

    // Step 3: Build meeting context for LLM
    const meetingContext = this.buildMeetingContextForConversationalLLM(meetings);

    // Step 4: Stage 1 - Structured extraction
    const structuredData = await this.extractStructuredDataForConversational(
      person.name || person.email,
      meetingContext,
      aiProvider
    );

    // Step 5: Stage 2 - Prose generation
    const markdownBrief = await this.generateConversationalProseBrief(
      person.name || person.email,
      structuredData,
      aiProvider
    );

    // Step 6: Build result
    const dataQuality: 'rich' | 'moderate' | 'sparse' =
      meetings.length >= 5 ? 'rich' :
      meetings.length >= 2 ? 'moderate' : 'sparse';

    return {
      participant: {
        name: person.name || person.email,
        email: person.email,
        keyProjects: structuredData.projects,
        quickQuestions: structuredData.questions,
        theirStrengths: structuredData.strengths,
        ownershipActions: {
          waitingOnThem: structuredData.theyOweUs || [],
          youOweThem: structuredData.weOweThem || [],
        },
        headline: this.generateConversationalHeadline(person, meetings),
        dataQuality,
        meetingCount: meetings.length,
        lastMeetingDate: meetings[0]?.createdAt ? new Date(meetings[0].createdAt).toISOString() : undefined,
      },
      generatedAt: new Date().toISOString(),
      markdownBrief,
      meetingsAnalyzed: meetings.length,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Find person by name or email query
   */
  private async findPersonByQuery(query: string): Promise<Person | null> {
    const { peopleRepo, meetingRepo } = getContainer();

    // Try exact email match first
    if (query.includes('@')) {
      const person = peopleRepo?.getByEmail(query);
      if (person) return person;
    }

    // Fuzzy name search in people repo
    const allPeople = peopleRepo?.listAll() || [];
    const queryLower = query.toLowerCase().trim();

    // Try exact name match first
    let match = allPeople.find((p: Person) =>
      p.name?.toLowerCase() === queryLower ||
      p.email.toLowerCase() === queryLower
    );
    if (match) return match;

    // Try partial name match
    match = allPeople.find((p: Person) =>
      p.name?.toLowerCase().includes(queryLower) ||
      p.email.toLowerCase().includes(queryLower)
    );
    if (match) return match;

    // Try first name only
    const firstName = queryLower.split(' ')[0];
    match = allPeople.find((p: Person) =>
      p.name?.toLowerCase().startsWith(firstName) ||
      p.email.split('@')[0].toLowerCase().includes(firstName)
    );
    if (match) return match;

    // Last resort: scan meeting titles for the name
    if (meetingRepo) {
      const meetings = meetingRepo.findAll();
      const meetingWithPerson = meetings.find((m: Meeting) =>
        m.title?.toLowerCase().includes(queryLower)
      );
      if (meetingWithPerson?.attendeeEmails?.length) {
        // Return first attendee as a pseudo-person
        const email = meetingWithPerson.attendeeEmails[0];
        return {
          email,
          name: query,
          lastMeetingAt: new Date(meetingWithPerson.createdAt),
          meetingCount: 1,
          totalDuration: 0,
        };
      }
    }

    return null;
  }

  /**
   * Quick search for people (autocomplete)
   */
  async quickSearchPerson(query: string): Promise<Person[]> {
    const { peopleRepo } = getContainer();
    if (!peopleRepo || query.length < 2) return [];

    const allPeople = peopleRepo.listAll();
    const queryLower = query.toLowerCase();

    return allPeople
      .filter((p: Person) =>
        p.name?.toLowerCase().includes(queryLower) ||
        p.email.toLowerCase().includes(queryLower) ||
        p.organization?.toLowerCase().includes(queryLower)
      )
      .sort((a: Person, b: Person) =>
        new Date(b.lastMeetingAt).getTime() - new Date(a.lastMeetingAt).getTime()
      )
      .slice(0, 10);
  }

  /**
   * Get time-weighted meetings for a person
   * Recent meetings get full context, older ones compressed
   */
  private async getWeightedMeetingsForPerson(person: Person): Promise<Meeting[]> {
    const { meetingRepo } = getContainer();
    if (!meetingRepo) return [];

    const allMeetings = meetingRepo.findAll();
    const participant: PrepParticipant = {
      name: person.name || '',
      email: person.email,
      company: person.organization || null,
      domain: person.email?.split('@')[1] || null,
    };

    let filtered = this.filterMeetingsByParticipant(allMeetings, participant);
    filtered = filtered.sort(
      (a: Meeting, b: Meeting) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Time-based filtering: prioritize recent meetings
    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    const fourWeeks = 28 * 24 * 60 * 60 * 1000;

    // Take all from last 2 weeks, sample from 2-4 weeks, limit older
    const recentMeetings = filtered.filter((m: Meeting) =>
      now - new Date(m.createdAt).getTime() < twoWeeks
    );
    const olderMeetings = filtered.filter((m: Meeting) => {
      const age = now - new Date(m.createdAt).getTime();
      return age >= twoWeeks && age < fourWeeks;
    }).slice(0, 3);
    const oldestMeetings = filtered.filter((m: Meeting) =>
      now - new Date(m.createdAt).getTime() >= fourWeeks
    ).slice(0, 2);

    return [...recentMeetings, ...olderMeetings, ...oldestMeetings].slice(0, 8);
  }

  /**
   * Build meeting context for conversational LLM prompt
   */
  private buildMeetingContextForConversationalLLM(meetings: Meeting[]): string {
    return meetings.map((m, idx) => {
      const date = new Date(m.createdAt);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const dateStr = daysAgo === 0 ? 'Today' :
                      daysAgo === 1 ? 'Yesterday' :
                      `${daysAgo} days ago`;

      const parts = [
        `---`,
        `Meeting ${idx + 1}: "${m.title}" (${dateStr}, ${date.toLocaleDateString()})`,
      ];

      if (m.summary) {
        parts.push(`Summary: ${m.summary.substring(0, 600)}`);
      }

      if (m.actionItems && m.actionItems.length > 0) {
        parts.push(`Action Items:`);
        m.actionItems.slice(0, 5).forEach(item => {
          parts.push(`  - ${item}`);
        });
      }

      if (m.overview) {
        parts.push(`Overview: ${m.overview.substring(0, 400)}`);
      }

      parts.push(`---`);
      return parts.join('\n');
    }).join('\n\n');
  }

  /**
   * Stage 1: Extract structured data for conversational prep
   */
  private async extractStructuredDataForConversational(
    personName: string,
    meetingContext: string,
    aiProvider: any
  ): Promise<{
    projects: ProjectContext[];
    theyOweUs: OwnershipActions['waitingOnThem'];
    weOweThem: OwnershipActions['youOweThem'];
    questions: SuggestedQuestion[];
    strengths: InferredTrait[];
  }> {
    const prompt = `You are analyzing meeting history with ${personName}.

MEETINGS TO ANALYZE:
${meetingContext}

Extract the following as JSON. CRITICAL: Only include facts explicitly stated in the meetings. Do NOT invent or assume information.

{
  "projects": [
    {
      "name": "project or topic name (from actual meeting content)",
      "status": "current status based on most recent discussion",
      "issues": ["specific issues mentioned"],
      "nextSteps": ["specific next steps from action items"],
      "lastDiscussed": "relative date like '3 days ago'",
      "citations": [{"meetingId": "", "meetingTitle": "...", "meetingDate": "...", "snippet": "relevant quote or paraphrase"}]
    }
  ],
  "theyOweUs": [
    {
      "description": "what they committed to do",
      "citation": {"meetingId": "", "meetingTitle": "...", "meetingDate": "...", "snippet": "their exact words"},
      "daysOverdue": null
    }
  ],
  "weOweThem": [
    {
      "description": "what we committed to do",
      "citation": {"meetingId": "", "meetingTitle": "...", "meetingDate": "...", "snippet": "our commitment"},
      "daysOverdue": null
    }
  ],
  "questions": [
    {
      "question": "specific question to ask based on past discussions",
      "reasoning": "why this is important based on meeting history",
      "citation": {"meetingId": "", "meetingTitle": "...", "meetingDate": "...", "snippet": "relevant context"}
    }
  ],
  "strengths": [
    {
      "trait": "observed strength or expertise area",
      "evidence": "what they said or did that shows this",
      "citation": {"meetingId": "", "meetingTitle": "...", "meetingDate": "..."}
    }
  ]
}

RULES:
- Only extract information explicitly present in the meetings
- Include verbatim quotes in citation snippets where possible
- If no data for a section, return empty array []
- Do not invent project names - use actual topics discussed
- For ownership items, look for phrases like "I'll", "we'll", "they'll", "send you", "get back to"
- Cluster related discussions into single projects where logical
- Questions should be specific follow-ups, not generic`;

    try {
      const response = await aiProvider.chat(
        [{ role: 'user', content: prompt }],
        { model: 'gpt-4o', temperature: 0.2, maxTokens: 2500, responseFormat: 'json' }
      );
      return JSON.parse(response);
    } catch (error) {
      logger.error('Failed to extract structured data for conversational prep', { error });
      return { projects: [], theyOweUs: [], weOweThem: [], questions: [], strengths: [] };
    }
  }

  /**
   * Stage 2: Generate prose brief in conversational format
   */
  private async generateConversationalProseBrief(
    personName: string,
    structuredData: {
      projects: ProjectContext[];
      theyOweUs: OwnershipActions['waitingOnThem'];
      weOweThem: OwnershipActions['youOweThem'];
      questions: SuggestedQuestion[];
      strengths: InferredTrait[];
    },
    aiProvider: any
  ): Promise<string> {
    const bannedList = this.BANNED_PHRASES.map(p => `- "${p}"`).join('\n');

    const prompt = `Write a conversational 30-second meeting prep brief for an upcoming meeting with ${personName}.

EXTRACTED DATA:
${JSON.stringify(structuredData, null, 2)}

Write in this exact format. SKIP any section that has no data - do not include empty sections.

## Key Active Projects with ${personName}

**{Project Name}**
- Status: {specific fact} [from: "{meeting title}"]
- Issues: {specific issues if any}
- Next Steps: {from action items}

(Repeat for each project, max 3)

## Quick Questions to Ask ${personName}
- {Question}? [context: {brief reason}]

(Max 4 questions)

## Their Key Strengths
- {Trait}: {brief evidence}

(Max 3 strengths, skip if none)

## Action Item Status

**Waiting on Them:**
- {item} (since {date})

**You Owe Them:**
- {item} (committed {date})

(Skip entire section if no items)

BANNED PHRASES (never use these):
${bannedList}

CRITICAL RULES:
- Be SPECIFIC - reference actual topics, names, dates from the data
- Every fact MUST reference its source meeting in brackets
- Write in second person ("You discussed...", "They mentioned...")
- NO generic advice or filler text
- Keep bullets under 20 words
- If a section has no data, OMIT it completely
- Sound natural and conversational, not robotic`;

    try {
      const response = await aiProvider.chat(
        [{ role: 'user', content: prompt }],
        { model: 'gpt-4o', temperature: 0.4, maxTokens: 1500 }
      );
      return response;
    } catch (error) {
      logger.error('Failed to generate conversational prose brief', { error });
      return `# Meeting Prep for ${personName}\n\nUnable to generate brief. Please try again.`;
    }
  }

  /**
   * Generate contextual headline for conversational prep
   */
  private generateConversationalHeadline(person: Person, meetings: Meeting[]): string {
    const name = person.name || person.email.split('@')[0];

    if (meetings.length === 0) {
      return `First meeting with ${name}`;
    }

    const lastMeeting = meetings[0];
    const daysAgo = Math.floor(
      (Date.now() - new Date(lastMeeting.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    const topic = lastMeeting.title || 'your discussion';
    const shortTopic = topic.length > 40 ? topic.substring(0, 40) + '...' : topic;

    if (daysAgo === 0) return `You met with ${name} today about "${shortTopic}"`;
    if (daysAgo === 1) return `You spoke yesterday about "${shortTopic}"`;
    if (daysAgo < 7) return `Last spoke ${daysAgo} days ago about "${shortTopic}"`;
    if (daysAgo < 30) return `Last met ${Math.floor(daysAgo / 7)} weeks ago - "${shortTopic}"`;
    return `It's been ${Math.floor(daysAgo / 30)} months since "${shortTopic}"`;
  }

  // ============================================================
  // CONVERSATIONAL PREP CHAT
  // ============================================================

  /**
   * Generate a chat response for the prep omnibar
   * Supports natural language queries and follow-up conversations
   * Enhanced with query classification, user context, and temporal filtering
   */
  async generatePrepChatResponse(
    input: PrepChatInput,
    existingConversation?: PrepConversation
  ): Promise<PrepChatResponse> {
    const startTime = Date.now();

    // Get user context for personalized responses
    const userContext = this.getUserContext();

    // Handle greeting + request combinations (e.g., "Hey, find my meeting with John")
    // Strip the greeting and process the actual request
    let processedMessage = input.message;
    if (startsWithGreeting(input.message) && !isPureGreeting(input.message)) {
      const strippedMessage = stripGreeting(input.message);
      if (strippedMessage && strippedMessage !== input.message) {
        processedMessage = strippedMessage;
        logger.info('Stripped greeting from message', {
          original: input.message,
          processed: processedMessage,
        });
      }
    }

    // Classify the query type for intelligent handling
    const classifiedQuery = this.classifyQueryType(processedMessage);

    logger.info('Generating prep chat response', {
      message: input.message.substring(0, 100),
      hasConversation: !!existingConversation,
      messageCount: existingConversation?.messages.length || 0,
      queryType: classifiedQuery.type,
      queryConfidence: classifiedQuery.confidence,
      dateRange: classifiedQuery.dateRange?.description,
      userName: userContext.name,
    });

    // Handle greetings immediately without LLM processing
    if (classifiedQuery.type === 'greeting') {
      const greetingResponseText = getGreetingResponse(input.message);
      const conversationId = existingConversation?.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const userMessage: PrepChatMessage = {
        id: `msg-${Date.now() - 1}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'user',
        content: input.message,
        timestamp: new Date().toISOString(),
      };

      const responseMessage: PrepChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'assistant',
        content: greetingResponseText,
        timestamp: new Date().toISOString(),
      };

      const updatedConversation: PrepConversation = {
        id: conversationId,
        messages: [...(existingConversation?.messages || []), userMessage, responseMessage],
        createdAt: existingConversation?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      logger.info('Greeting response generated', {
        conversationId,
        responseLength: greetingResponseText.length,
        processingTimeMs: Date.now() - startTime,
      });

      return {
        conversationId,
        message: responseMessage,
        conversation: updatedConversation,
      };
    }

    const { aiProvider, meetingRepo } = getContainer();
    if (!aiProvider) throw new Error('AI provider not available');
    if (!meetingRepo) throw new Error('Meeting repository not available');

    // ============================================================
    // OPTIMIZATION: Single LLM extraction upfront (avoids 2-3 duplicate calls)
    // ============================================================
    const llmExtraction = await this.extractEntityWithLLM(processedMessage, existingConversation);

    // Extract person context from message or existing conversation (pass pre-extracted entity)
    const personContext = await this.extractPersonContextFromChat(
      processedMessage,
      existingConversation,
      llmExtraction // Pass pre-extracted entity to avoid duplicate LLM call
    );

    // Also extract raw person name from message for fallback search
    let extractedPersonName = this.extractPersonNameFromMessage(processedMessage);

    // If regex extraction failed, use LLM extraction for CRM lookup
    if (!extractedPersonName && !personContext) {
      if (llmExtraction.entity && llmExtraction.type === 'person') {
        extractedPersonName = llmExtraction.entity;
        logger.info('Using LLM-extracted name for CRM lookup', { name: extractedPersonName });
      }
    }

    // Use the single LLM extraction result for mentioned name
    const mentionedName = llmExtraction.entity;

    // ============================================================
    // DISAMBIGUATION: Check for ambiguous names (e.g., just "Sarah")
    // ============================================================
    const isAmbiguousName = mentionedName && !mentionedName.includes(' '); // Single word name
    if (isAmbiguousName && !existingConversation) {
      // Search for potential matches in both meeting history and CRM
      const potentialMatches: Array<{ name: string; source: string; email?: string }> = [];

      // Check people repository for matches
      const { peopleRepo, hubSpotService, settingsRepo } = getContainer();
      if (peopleRepo) {
        const matchingPeople = peopleRepo.search(mentionedName);
        for (const p of matchingPeople.slice(0, 3)) {
          potentialMatches.push({ name: p.name || p.email, source: 'meeting history', email: p.email });
        }
      }

      // Check CRM for matches by name
      const settings = settingsRepo?.getSettings();
      const hubspotToken = settings?.crmConnections?.hubspot as HubSpotOAuthToken | undefined;
      if (hubSpotService && hubspotToken?.accessToken) {
        try {
          let token = hubspotToken;
          if (hubSpotService.isTokenExpired(token) && token.refreshToken) {
            token = await hubSpotService.refreshAccessToken(token.refreshToken);
          }
          const crmContact = await hubSpotService.searchContactByName(mentionedName, token.accessToken);
          if (crmContact?.name) {
            // Check if this is a different person than what we found in meetings
            const isDuplicate = potentialMatches.some(m =>
              m.email === crmContact.email ||
              m.name.toLowerCase() === crmContact.name?.toLowerCase()
            );
            if (!isDuplicate) {
              potentialMatches.push({ name: crmContact.name, source: 'HubSpot CRM', email: crmContact.email });
            }
          }
        } catch (err) {
          logger.warn('CRM search for disambiguation failed', { error: err });
        }
      }

      // If multiple distinct people found, ask for clarification
      if (potentialMatches.length > 1) {
        const matchList = potentialMatches
          .map(m => `• **${m.name}** (${m.source})`)
          .join('\n');

        const clarificationMessage = `I found multiple people named "${mentionedName}":\n\n${matchList}\n\nWhich ${mentionedName} are you asking about? Please specify their full name.`;

        const clarificationResponse: PrepChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: 'assistant',
          content: clarificationMessage,
          timestamp: new Date().toISOString(),
        };

        const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const now = new Date().toISOString();
        const conversation: PrepConversation = {
          id: conversationId,
          createdAt: now,
          updatedAt: now,
          messages: [
            { id: `msg-${Date.now()}-user`, role: 'user', content: input.message, timestamp: now },
            clarificationResponse,
          ],
        };

        logger.info('Requesting clarification for ambiguous name', {
          mentionedName,
          matchCount: potentialMatches.length,
          matches: potentialMatches.map(m => m.name),
        });

        return {
          conversationId,
          message: clarificationResponse,
          conversation,
        };
      }
    }

    // ============================================================
    // OPTIMIZATION: Parallelize CRM lookup and meeting lookups
    // CRM lookup doesn't depend on meeting results, so start it early
    // ============================================================
    const { settingsRepo, hubSpotService, salesforceService } = getContainer();
    const settings = settingsRepo?.getSettings();

    // Determine CRM lookup parameters upfront
    let personEmail = personContext?.email;
    let personName = personContext?.name || extractedPersonName;
    let useNameSearch = false;

    if (extractedPersonName && personContext?.name) {
      const extractedLower = extractedPersonName.toLowerCase();
      const contextLower = personContext.name.toLowerCase();
      if (!contextLower.includes(extractedLower) && !extractedLower.includes(contextLower)) {
        personName = extractedPersonName;
        personEmail = undefined;
        useNameSearch = true;
        logger.info('User mentioned different name than context, switching to name-based CRM search', {
          contextName: personContext.name,
          extractedName: extractedPersonName,
        });
      }
    }

    logger.info('CRM lookup context', {
      hasPersonContext: !!personContext,
      personContextName: personContext?.name,
      personContextEmail: personContext?.email,
      extractedPersonName,
      resolvedPersonName: personName,
      useNameSearch,
      hasHubSpotService: !!hubSpotService,
      hasHubSpotToken: !!settings?.crmConnections?.hubspot,
    });

    // Start CRM lookup as a promise (runs in parallel with meeting lookups)
    const crmLookupPromise = this.fetchCRMDataForChat(
      personEmail,
      personName,
      useNameSearch,
      settings,
      hubSpotService,
      salesforceService
    );

    // Gather meeting context if we have a person
    let meetingContext = '';
    let meetingReferences: { meetingId: string; title: string; date: string }[] = [];
    let allMeetings: Meeting[] = [];

    if (personContext) {
      allMeetings = await this.getWeightedMeetingsForPerson(personContext);

      // Apply date range filter if parsed from query
      if (classifiedQuery.dateRange) {
        const filteredMeetings = this.filterMeetingsByDateRange(allMeetings, classifiedQuery.dateRange);
        if (filteredMeetings.length > 0) {
          allMeetings = filteredMeetings;
          logger.info('Filtered meetings by date range', {
            description: classifiedQuery.dateRange.description,
            originalCount: allMeetings.length,
            filteredCount: filteredMeetings.length,
          });
        }
      }

      meetingContext = this.buildMeetingContextForChat(allMeetings);
      meetingReferences = allMeetings.slice(0, 5).map((m, idx) => ({
        meetingId: m.id,
        title: m.title || `Meeting ${idx + 1}`,
        date: new Date(m.createdAt).toLocaleDateString(),
      }));
    }

    // Check if this is a search query
    const isSearchQuery = this.detectSearchIntent(processedMessage);
    if (isSearchQuery) {
      let searchResults = await this.searchMeetingsForChat(processedMessage, meetingRepo);

      // Apply date range filter to search results
      if (classifiedQuery.dateRange && searchResults.length > 0) {
        searchResults = this.filterMeetingsByDateRange(searchResults, classifiedQuery.dateRange);
      }

      if (searchResults.length > 0) {
        meetingContext += '\n\nSEARCH RESULTS:\n' + searchResults.map((m, idx) =>
          `[${idx + 1}] "${m.title}" (${new Date(m.createdAt).toLocaleDateString()})`
        ).join('\n');
        meetingReferences = searchResults.slice(0, 5).map((m, idx) => ({
          meetingId: m.id,
          title: m.title || `Result ${idx + 1}`,
          date: new Date(m.createdAt).toLocaleDateString(),
        }));
        allMeetings = searchResults;
      }
    }

    // Fallback: If no meetings found but we have a person name, search by name in all meeting content
    if (meetingReferences.length === 0 && extractedPersonName) {
      logger.info('No meetings found via person lookup, trying name-based search', { name: extractedPersonName });
      let nameSearchResults = await this.searchMeetingsByPersonName(extractedPersonName, meetingRepo);

      // Apply date range filter
      if (classifiedQuery.dateRange && nameSearchResults.length > 0) {
        nameSearchResults = this.filterMeetingsByDateRange(nameSearchResults, classifiedQuery.dateRange);
      }

      if (nameSearchResults.length > 0) {
        meetingContext = this.buildMeetingContextForChat(nameSearchResults);
        meetingReferences = nameSearchResults.slice(0, 5).map((m, idx) => ({
          meetingId: m.id,
          title: m.title || `Meeting ${idx + 1}`,
          date: new Date(m.createdAt).toLocaleDateString(),
        }));
        allMeetings = nameSearchResults;
      }
    }

    // Await CRM lookup result (should be done or nearly done by now)
    const crmData = await crmLookupPromise;

    // Build CRM context string for the prompt
    let crmContext = '';
    if (crmData) {
      crmContext = this.buildCRMContextForChat(crmData);
      logger.info('CRM data included in chat context', {
        contactName: crmData.name,
        email: crmData.email,
        source: crmData.source,
        dealsCount: crmData.deals?.length || 0,
        notesCount: crmData.notes?.length || 0,
        emailsCount: crmData.emails?.length || 0,
      });
    } else {
      logger.debug('No CRM data found for chat context', { personName, personEmail });
    }

    // Determine if user was an attendee of relevant meetings
    const userWasAttendee = allMeetings.some(m => this.wasUserAttendee(m, userContext));
    const enrichedUserContext: UserContext = {
      ...userContext,
      wasAttendee: userWasAttendee,
    };

    // Fetch calendar events if this is a calendar-related query
    let calendarContext = '';
    const isCalendarQuery = this.detectCalendarIntent(processedMessage);
    if (isCalendarQuery) {
      logger.debug('Calendar intent detected, fetching upcoming events');
      const calendarEvents = await this.fetchUpcomingCalendarEvents();
      calendarContext = this.buildCalendarContext(calendarEvents);
      logger.debug('Calendar context built', { eventCount: calendarEvents.length });
    }

    // Build system prompt with communication guidelines, user context, query type, and CRM data
    const systemPrompt = this.buildChatSystemPrompt(
      personContext || (extractedPersonName ? { name: extractedPersonName } as Person : null),
      meetingContext,
      enrichedUserContext,
      classifiedQuery,
      crmContext,
      calendarContext
    );

    // Build conversation history for context
    const conversationMessages = existingConversation?.messages || [];
    const chatMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: processedMessage }, // Use processed message (greeting stripped)
    ];

    // Use temperature based on query type
    const temperature = this.getTemperatureForQueryType(classifiedQuery.type);

    // Generate response
    const response = await aiProvider.chat(chatMessages, {
      model: 'gpt-4o',
      temperature,
      maxTokens: 1500,
    });

    // Build the response message
    const responseMessage: PrepChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      meetingReferences: meetingReferences.length > 0 ? meetingReferences : undefined,
    };

    // Build updated conversation
    const conversationId = existingConversation?.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const userMessage: PrepChatMessage = {
      id: `msg-${Date.now() - 1}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content: input.message,
      timestamp: new Date().toISOString(),
    };

    const updatedConversation: PrepConversation = {
      id: conversationId,
      messages: [...(existingConversation?.messages || []), userMessage, responseMessage],
      createdAt: existingConversation?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participantContext: personContext ? {
        name: personContext.name || personContext.email,
        email: personContext.email,
        organization: personContext.organization || null,
        meetingIds: meetingReferences.map(r => r.meetingId),
      } : existingConversation?.participantContext,
    };

    logger.info('Prep chat response generated', {
      conversationId,
      responseLength: response.length,
      processingTimeMs: Date.now() - startTime,
    });

    return {
      conversationId,
      message: responseMessage,
      conversation: updatedConversation,
    };
  }

  /**
   * Generate a streaming chat response for the prep omnibar
   * Streams the LLM response as it generates for lower perceived latency
   */
  async generatePrepChatResponseStreaming(
    input: PrepChatInput,
    existingConversation: PrepConversation | undefined,
    onChunk: (chunk: string) => void,
    onStart: (metadata: { conversationId: string; meetingReferences: { meetingId: string; title: string; date: string }[] }) => void,
    onEnd: (response: PrepChatResponse) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Get user context for personalized responses
      const userContext = this.getUserContext();

      // Handle greeting + request combinations (e.g., "Hey, find my meeting with John")
      // Strip the greeting and process the actual request
      let processedMessage = input.message;
      if (startsWithGreeting(input.message) && !isPureGreeting(input.message)) {
        const strippedMessage = stripGreeting(input.message);
        if (strippedMessage && strippedMessage !== input.message) {
          processedMessage = strippedMessage;
          logger.info('Stripped greeting from message (streaming)', {
            original: input.message,
            processed: processedMessage,
          });
        }
      }

      // Classify the query type for intelligent handling
      const classifiedQuery = this.classifyQueryType(processedMessage);

      logger.info('Generating streaming prep chat response', {
        message: input.message.substring(0, 100),
        hasConversation: !!existingConversation,
        queryType: classifiedQuery.type,
      });

      // Handle greetings immediately without LLM processing
      if (classifiedQuery.type === 'greeting') {
        const greetingResponseText = getGreetingResponse(input.message);
        const conversationId = existingConversation?.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        // Call onStart
        onStart({
          conversationId,
          meetingReferences: [],
        });

        // Stream the greeting response (simulate streaming for consistency)
        const words = greetingResponseText.split(' ');
        for (const word of words) {
          onChunk(word + ' ');
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        const userMessage: PrepChatMessage = {
          id: `msg-${Date.now() - 1}-${Math.random().toString(36).slice(2, 9)}`,
          role: 'user',
          content: input.message,
          timestamp: new Date().toISOString(),
        };

        const responseMessage: PrepChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: 'assistant',
          content: greetingResponseText,
          timestamp: new Date().toISOString(),
        };

        const updatedConversation: PrepConversation = {
          id: conversationId,
          messages: [...(existingConversation?.messages || []), userMessage, responseMessage],
          createdAt: existingConversation?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Call onEnd
        onEnd({
          conversationId,
          message: responseMessage,
          conversation: updatedConversation,
        });

        logger.info('Streaming greeting response completed', {
          conversationId,
          processingTimeMs: Date.now() - startTime,
        });

        return;
      }

      const { aiProvider, meetingRepo } = getContainer();
      if (!aiProvider) throw new Error('AI provider not available');
      if (!meetingRepo) throw new Error('Meeting repository not available');

      // Single LLM extraction upfront
      const llmExtraction = await this.extractEntityWithLLM(processedMessage, existingConversation);

      // Extract person context from message or existing conversation
      const personContext = await this.extractPersonContextFromChat(
        processedMessage,
        existingConversation,
        llmExtraction
      );

      // Extract raw person name from message for fallback search
      let extractedPersonName = this.extractPersonNameFromMessage(processedMessage);
      if (!extractedPersonName && !personContext) {
        if (llmExtraction.entity && llmExtraction.type === 'person') {
          extractedPersonName = llmExtraction.entity;
        }
      }

      const mentionedName = llmExtraction.entity;

      // Check for disambiguation (single word name)
      const isAmbiguousName = mentionedName && !mentionedName.includes(' ');
      if (isAmbiguousName && !existingConversation) {
        const potentialMatches: Array<{ name: string; source: string; email?: string }> = [];
        const { peopleRepo, hubSpotService, settingsRepo } = getContainer();

        if (peopleRepo) {
          const matchingPeople = peopleRepo.search(mentionedName);
          for (const p of matchingPeople.slice(0, 3)) {
            potentialMatches.push({ name: p.name || p.email, source: 'meeting history', email: p.email });
          }
        }

        const settings = settingsRepo?.getSettings();
        const hubspotToken = settings?.crmConnections?.hubspot as HubSpotOAuthToken | undefined;
        if (hubSpotService && hubspotToken?.accessToken) {
          try {
            let token = hubspotToken;
            if (hubSpotService.isTokenExpired(token) && token.refreshToken) {
              token = await hubSpotService.refreshAccessToken(token.refreshToken);
            }
            const crmContact = await hubSpotService.searchContactByName(mentionedName, token.accessToken);
            if (crmContact?.name) {
              const isDuplicate = potentialMatches.some(m =>
                m.email === crmContact.email || m.name.toLowerCase() === crmContact.name?.toLowerCase()
              );
              if (!isDuplicate) {
                potentialMatches.push({ name: crmContact.name, source: 'HubSpot CRM', email: crmContact.email });
              }
            }
          } catch (err) {
            logger.warn('CRM search for disambiguation failed', { error: err });
          }
        }

        // If multiple distinct people found, return clarification (no streaming needed)
        if (potentialMatches.length > 1) {
          const matchList = potentialMatches.map(m => `• **${m.name}** (${m.source})`).join('\n');
          const clarificationMessage = `I found multiple people named "${mentionedName}":\n\n${matchList}\n\nWhich ${mentionedName} are you asking about? Please specify their full name.`;

          const clarificationResponse: PrepChatMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            role: 'assistant',
            content: clarificationMessage,
            timestamp: new Date().toISOString(),
          };

          const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const now = new Date().toISOString();
          const conversation: PrepConversation = {
            id: conversationId,
            createdAt: now,
            updatedAt: now,
            messages: [
              { id: `msg-${Date.now()}-user`, role: 'user', content: input.message, timestamp: now },
              clarificationResponse,
            ],
          };

          onStart({ conversationId, meetingReferences: [] });
          onChunk(clarificationMessage);
          onEnd({ conversationId, message: clarificationResponse, conversation });
          return;
        }
      }

      // Start CRM and meeting lookups in parallel
      const { settingsRepo, hubSpotService, salesforceService } = getContainer();
      const settings = settingsRepo?.getSettings();

      let personEmail = personContext?.email;
      let personName = personContext?.name || extractedPersonName;
      let useNameSearch = false;

      if (extractedPersonName && personContext?.name) {
        const extractedLower = extractedPersonName.toLowerCase();
        const contextLower = personContext.name.toLowerCase();
        if (!contextLower.includes(extractedLower) && !extractedLower.includes(contextLower)) {
          personName = extractedPersonName;
          personEmail = undefined;
          useNameSearch = true;
        }
      }

      const crmLookupPromise = this.fetchCRMDataForChat(
        personEmail, personName, useNameSearch, settings, hubSpotService, salesforceService
      );

      // Gather meeting context
      let meetingContext = '';
      let meetingReferences: { meetingId: string; title: string; date: string }[] = [];
      let allMeetings: Meeting[] = [];

      if (personContext) {
        allMeetings = await this.getWeightedMeetingsForPerson(personContext);
        if (classifiedQuery.dateRange) {
          const filteredMeetings = this.filterMeetingsByDateRange(allMeetings, classifiedQuery.dateRange);
          if (filteredMeetings.length > 0) allMeetings = filteredMeetings;
        }
        meetingContext = this.buildMeetingContextForChat(allMeetings);
        meetingReferences = allMeetings.slice(0, 5).map((m, idx) => ({
          meetingId: m.id,
          title: m.title || `Meeting ${idx + 1}`,
          date: new Date(m.createdAt).toLocaleDateString(),
        }));
      }

      const isSearchQuery = this.detectSearchIntent(processedMessage);
      if (isSearchQuery) {
        let searchResults = await this.searchMeetingsForChat(processedMessage, meetingRepo);
        if (classifiedQuery.dateRange && searchResults.length > 0) {
          searchResults = this.filterMeetingsByDateRange(searchResults, classifiedQuery.dateRange);
        }
        if (searchResults.length > 0) {
          meetingContext += '\n\nSEARCH RESULTS:\n' + searchResults.map((m, idx) =>
            `[${idx + 1}] "${m.title}" (${new Date(m.createdAt).toLocaleDateString()})`
          ).join('\n');
          meetingReferences = searchResults.slice(0, 5).map((m, idx) => ({
            meetingId: m.id,
            title: m.title || `Result ${idx + 1}`,
            date: new Date(m.createdAt).toLocaleDateString(),
          }));
          allMeetings = searchResults;
        }
      }

      if (meetingReferences.length === 0 && extractedPersonName) {
        let nameSearchResults = await this.searchMeetingsByPersonName(extractedPersonName, meetingRepo);
        if (classifiedQuery.dateRange && nameSearchResults.length > 0) {
          nameSearchResults = this.filterMeetingsByDateRange(nameSearchResults, classifiedQuery.dateRange);
        }
        if (nameSearchResults.length > 0) {
          meetingContext = this.buildMeetingContextForChat(nameSearchResults);
          meetingReferences = nameSearchResults.slice(0, 5).map((m, idx) => ({
            meetingId: m.id,
            title: m.title || `Meeting ${idx + 1}`,
            date: new Date(m.createdAt).toLocaleDateString(),
          }));
          allMeetings = nameSearchResults;
        }
      }

      // Await CRM data
      const crmData = await crmLookupPromise;
      let crmContext = '';
      if (crmData) {
        crmContext = this.buildCRMContextForChat(crmData);
      }

      // Fetch calendar events if this is a calendar-related query
      let calendarContext = '';
      const isCalendarQuery = this.detectCalendarIntent(processedMessage);
      if (isCalendarQuery) {
        logger.debug('Calendar intent detected, fetching upcoming events');
        const calendarEvents = await this.fetchUpcomingCalendarEvents();
        calendarContext = this.buildCalendarContext(calendarEvents);
        logger.debug('Calendar context built', { eventCount: calendarEvents.length });
      }

      // Build system prompt
      const userWasAttendee = allMeetings.some(m => this.wasUserAttendee(m, userContext));
      const enrichedUserContext: UserContext = { ...userContext, wasAttendee: userWasAttendee };

      const systemPrompt = this.buildChatSystemPrompt(
        personContext || (extractedPersonName ? { name: extractedPersonName } as Person : null),
        meetingContext,
        enrichedUserContext,
        classifiedQuery,
        crmContext,
        calendarContext
      );

      const conversationMessages = existingConversation?.messages || [];
      const chatMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...conversationMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: processedMessage }, // Use processed message (greeting stripped)
      ];

      const temperature = this.getTemperatureForQueryType(classifiedQuery.type);
      const conversationId = existingConversation?.id || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Send start event with metadata
      onStart({ conversationId, meetingReferences });

      // Stream the response
      let fullResponse = '';
      for await (const chunk of aiProvider.chatStream(chatMessages, {
        model: 'gpt-4o',
        temperature,
        maxTokens: 1500,
      })) {
        fullResponse += chunk;
        onChunk(chunk);
      }

      // Build final response
      const responseMessage: PrepChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
        meetingReferences: meetingReferences.length > 0 ? meetingReferences : undefined,
      };

      const userMessage: PrepChatMessage = {
        id: `msg-${Date.now() - 1}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'user',
        content: input.message,
        timestamp: new Date().toISOString(),
      };

      const updatedConversation: PrepConversation = {
        id: conversationId,
        messages: [...(existingConversation?.messages || []), userMessage, responseMessage],
        createdAt: existingConversation?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        participantContext: personContext ? {
          name: personContext.name || personContext.email,
          email: personContext.email,
          organization: personContext.organization || null,
          meetingIds: meetingReferences.map(r => r.meetingId),
        } : existingConversation?.participantContext,
      };

      logger.info('Streaming prep chat response completed', {
        conversationId,
        responseLength: fullResponse.length,
        processingTimeMs: Date.now() - startTime,
      });

      onEnd({ conversationId, message: responseMessage, conversation: updatedConversation });
    } catch (error) {
      logger.error('Streaming prep chat failed', { error });
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Build the system prompt for chat with communication guidelines
   * Enhanced with user context, query type awareness, conflict resolution, and CRM data
   */
  private buildChatSystemPrompt(
    personContext: Person | null,
    meetingContext: string,
    userContext?: UserContext,
    classifiedQuery?: ClassifiedQuery,
    crmContext?: string,
    calendarContext?: string
  ): string {
    const personName = personContext?.name || null;
    const bannedList = this.BANNED_PHRASES.map(p => `"${p}"`).join(', ');

    // Build user identity section
    let userIdentitySection = '';
    if (userContext && (userContext.name || userContext.email)) {
      const parts = [];
      if (userContext.name) parts.push(`**Name:** ${userContext.name}`);
      if (userContext.position) parts.push(`**Role:** ${userContext.position}`);
      if (userContext.company) parts.push(`**Company:** ${userContext.company}`);
      if (userContext.wasAttendee !== undefined) {
        parts.push(userContext.wasAttendee
          ? '**Attendance:** User was present in the referenced meetings - can provide brief summaries'
          : '**Attendance:** User was NOT present in these meetings - provide more context and detail'
        );
      }
      userIdentitySection = `## WHO IS ASKING
${parts.join('\n')}

Personalize your response based on this context. If they were in the meeting, be concise. If they weren't, provide more background.
`;
    }

    // Build query-type-specific instructions
    let queryTypeInstructions = '';
    if (classifiedQuery) {
      switch (classifiedQuery.type) {
        case 'retrieval':
          queryTypeInstructions = `## QUERY TYPE: RETRIEVAL
This is a factual question about past meetings. You MUST:
- Cite every fact with [1], [2] references to specific meetings
- Only state information explicitly found in the meeting data
- If information isn't in the meetings, say "I don't have that information"
- Do NOT infer or guess beyond what's documented
`;
          break;
        case 'generative':
          queryTypeInstructions = `## QUERY TYPE: GENERATIVE
The user wants you to create content (email, message, response). You should:
- Draw on meeting context for accurate details and tone
- Be creative in phrasing while staying factually grounded
- Lighter citation requirements - cite key facts but flow naturally
- Focus on producing useful, actionable output
`;
          break;
        case 'hybrid':
          queryTypeInstructions = `## QUERY TYPE: HYBRID
This query needs both retrieval and generation. You should:
- Start with factual grounding from meetings (cite sources)
- Then provide synthesis, recommendations, or created content
- Balance accuracy with usefulness
`;
          break;
      }

      // Add date range context if present
      if (classifiedQuery.dateRange?.description) {
        queryTypeInstructions += `\n**Time Context:** User is asking about "${classifiedQuery.dateRange.description}" - focus on meetings from this period.\n`;
      }
    }

    // Conflict resolution instructions
    const conflictResolutionSection = `## CONFLICT RESOLUTION (CRITICAL)
When information conflicts between meetings:
1. **Later decisions override earlier ones** - The most recent meeting's decision is authoritative
2. **Flag changes explicitly** - Say "Previously X [1], but this was updated to Y [2]"
3. **Note reversals** - If something was explicitly reversed, highlight: "This was originally decided as X, but later changed to Y"
4. **Pattern recognition** - If the same issue appears in multiple meetings, note: "This has been discussed in [N] meetings..."
5. **Prioritize decisions over discussions** - Firm decisions outweigh tentative discussions
`;

    return `You are a strategic meeting preparation assistant. You help users prepare for meetings by providing insights from past interactions.

${userIdentitySection}
${queryTypeInstructions}
## RESPONSE STYLE (MANDATORY)

1. **NO PREAMBLES** - Never start with "I'd be happy to help", "Sure!", "Great question", "Let me help you", etc. Dive straight into the answer.

2. **DON'T RESTATE** - Never repeat the user's question back to them. They know what they asked.

3. **BE DECISIVE** - Give ONE clear recommendation. Don't hedge with "you could do X or Y". Pick the best option.

4. **INVERTED PYRAMID** - Put the most critical information FIRST. Lead with the key insight, then add details.

5. **CONCISE FORMAT**:
   - Use ## headers for major sections
   - Use **bold** for key terms and names
   - Use bullet points for lists
   - Keep bullets under 20 words
   - Short paragraphs (2-3 sentences max)

6. **CITE SOURCES** - Reference past meetings with [1], [2] notation inline. Example: "They mentioned the deadline moved to Friday [1]"

7. **ACTION-ORIENTED** - End with specific next steps, questions to ask, or talking points.

${conflictResolutionSection}

## TONE

Write like an experienced colleague who knows the context, not a customer service bot:
- Use "I" statements: "I can see the pattern here...", "I'd recommend..."
- Make connections: "This reminds me of what happened with..."
- Give direct advice, not options
- You're a trusted advisor who understands the business context

## BANNED PHRASES (never use these)
${bannedList}

${calendarContext ? `## CALENDAR CONTEXT\n${calendarContext}\n` : ''}
${personContext ? this.buildPersonContextSection(personContext) : ''}
${meetingContext ? `## MEETING HISTORY\n${meetingContext}\n` : ''}
${crmContext ? `## CRM DATA (from HubSpot/Salesforce)\n${crmContext}\n` : ''}

## NO DATA FOUND (when person has no meeting history or CRM data)

If there's no meeting data for a person, check if CRM data is available and use that. If neither is available:
1. Keep response SHORT (3-5 sentences max) - do NOT write long explanations
2. State clearly: "I don't see any information about [Name] in your meeting history or upcoming calendar events."
3. Ask for context with a brief bullet list:
   - When/where you're meeting them
   - What company or organization they're with
   - The purpose of the meeting
4. End with ONE sentence about how more context would help
5. Do NOT pad the response with general advice or lengthy explanations`;
  }

  /**
   * Build the person context section for the system prompt
   * Includes name, email, and organization when available
   */
  private buildPersonContextSection(person: Person): string {
    const parts = [`## PERSON CONTEXT`, `The user is asking about: **${person.name || person.email}**`];

    if (person.email) {
      parts.push(`**Email:** ${person.email}`);
    } else {
      parts.push(`**Email:** Not available in contacts`);
    }
    if (person.organization) {
      parts.push(`**Organization:** ${person.organization}`);
    } else {
      parts.push(`**Organization:** Not available in contacts`);
    }
    if (person.meetingCount > 0) {
      parts.push(`**Meeting history:** ${person.meetingCount} meeting${person.meetingCount > 1 ? 's' : ''}`);
    }

    parts.push('');
    parts.push('IMPORTANT: If the user asks for contact information (email, organization), provide it directly from the data above. If a field shows "Not available", tell them it\'s not in your contacts database.');

    return parts.join('\n') + '\n';
  }

  /**
   * Build CRM context string for the chat prompt
   * Includes deals, notes, emails, and other CRM data
   */
  private buildCRMContextForChat(crmData: CRMContactData): string {
    const sections: string[] = [];

    // Contact info
    sections.push(`**Contact:** ${crmData.name || crmData.email} (${crmData.source === 'hubspot' ? 'HubSpot' : 'Salesforce'})`);
    if (crmData.email) {
      sections.push(`**Email:** ${crmData.email}`);
    }
    if (crmData.jobTitle) {
      sections.push(`**Job Title:** ${crmData.jobTitle}`);
    }
    if (crmData.role) {
      sections.push(`**Role:** ${crmData.role}`);
    }

    // Deals
    if (crmData.deals && crmData.deals.length > 0) {
      sections.push('\n### Active Deals');
      for (const deal of crmData.deals.slice(0, 3)) {
        const dealParts = [`- **${deal.dealName || 'Unnamed Deal'}**`];
        if (deal.dealStage) dealParts.push(`Stage: ${deal.dealStage}`);
        if (deal.dealValue) dealParts.push(`Value: $${deal.dealValue.toLocaleString()}`);
        if (deal.closeDate) dealParts.push(`Close Date: ${deal.closeDate}`);
        sections.push(dealParts.join(' | '));
      }
    }

    // CRM Notes (key intel)
    if (crmData.notes && crmData.notes.length > 0) {
      sections.push('\n### CRM Notes');
      for (const note of crmData.notes.slice(0, 5)) {
        const noteDate = new Date(note.date).toLocaleDateString();
        // Include full note content for LLM context
        sections.push(`- [${noteDate}] ${note.content}`);
      }
    }

    // Recent emails
    if (crmData.emails && crmData.emails.length > 0) {
      sections.push('\n### Recent Email Activity');
      for (const email of crmData.emails.slice(0, 5)) {
        const emailDate = new Date(email.date).toLocaleDateString();
        const direction = email.direction === 'inbound' ? '←' : '→';
        sections.push(`- [${emailDate}] ${direction} ${email.subject}`);
        if (email.snippet) {
          sections.push(`  "${email.snippet.substring(0, 150)}..."`);
        }
      }
    }

    // Last activity
    if (crmData.lastActivityDate) {
      sections.push(`\n**Last CRM Activity:** ${new Date(crmData.lastActivityDate).toLocaleDateString()}`);
    }

    sections.push('\nIMPORTANT: Use this CRM data to provide context about the relationship, deal status, and any notes that might be relevant to the user\'s question.');

    return sections.join('\n');
  }

  /**
   * Extract person context from chat message or conversation using LLM
   * This replaces the old regex-based approach with intelligent understanding
   * @param message - The user's message
   * @param existingConversation - Optional existing conversation for context
   * @param preExtractedEntity - Optional pre-extracted entity to avoid duplicate LLM calls
   */
  private async extractPersonContextFromChat(
    message: string,
    existingConversation?: PrepConversation,
    preExtractedEntity?: ExtractedEntity
  ): Promise<Person | null> {
    // Use pre-extracted entity if provided, otherwise extract (for backwards compatibility)
    const extracted = preExtractedEntity || await this.extractEntityWithLLM(message, existingConversation);

    // First check existing conversation context for continuity
    if (existingConversation?.participantContext?.email) {
      const { peopleRepo } = getContainer();
      const person = peopleRepo?.getByEmail(existingConversation.participantContext.email);

      // If no new entity detected or low confidence, continue with existing context
      if (!extracted.entity || extracted.confidence < 0.5) {
        if (person) return person;
      }

      // If extracted entity matches existing context, return existing person
      if (extracted.entity && person) {
        const entityLower = extracted.entity.toLowerCase();
        const personNameLower = (person.name || '').toLowerCase();
        const personEmailLower = person.email.toLowerCase();

        if (personNameLower.includes(entityLower) ||
            entityLower.includes(personNameLower.split(' ')[0]) ||
            personEmailLower.includes(entityLower)) {
          return person;
        }
      }

      // New entity mentioned - try to find them
      if (extracted.entity) {
        const newPerson = await this.findPersonByQuery(extracted.entity);
        if (newPerson) return newPerson;

        // Check implicit resolutions (e.g., "they" → "Devin")
        for (const resolved of Object.values(extracted.implicitResolutions)) {
          const resolvedPerson = await this.findPersonByQuery(resolved);
          if (resolvedPerson) return resolvedPerson;
        }
      }

      // Fall back to existing context if still valid
      if (person) return person;
    }

    // No existing conversation context - use extracted entity
    logger.debug('LLM entity extraction result', {
      message: message.substring(0, 50),
      entity: extracted.entity,
      type: extracted.type,
      intent: extracted.intent,
      confidence: extracted.confidence,
    });

    // If we extracted an entity, try to find the person
    if (extracted.entity && extracted.type === 'person') {
      const person = await this.findPersonByQuery(extracted.entity);
      if (person) return person;
    }

    // Check implicit resolutions
    for (const resolved of Object.values(extracted.implicitResolutions)) {
      const person = await this.findPersonByQuery(resolved);
      if (person) return person;
    }

    // For company/project queries, try to find associated person
    if (extracted.entity && (extracted.type === 'company' || extracted.type === 'project')) {
      // Search for meetings mentioning this entity
      const { meetingRepo } = getContainer();
      if (meetingRepo) {
        const meetings = meetingRepo.findAll();
        for (const meeting of meetings.slice(0, 20)) {
          const searchText = `${meeting.title || ''} ${meeting.summary || ''}`.toLowerCase();
          if (searchText.includes(extracted.entity.toLowerCase())) {
            // Found a meeting - check for attendees
            if (meeting.attendeeEmails && meeting.attendeeEmails.length > 0) {
              const { peopleRepo } = getContainer();
              const person = peopleRepo?.getByEmail(meeting.attendeeEmails[0]);
              if (person) return person;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Get the extracted entity for use in response generation
   * Exposes the LLM extraction result for richer context
   */
  async getExtractedEntityForChat(
    message: string,
    existingConversation?: PrepConversation
  ): Promise<ExtractedEntity> {
    return this.extractEntityWithLLM(message, existingConversation);
  }

  /**
   * Detect if the message is a search query
   */
  private detectSearchIntent(message: string): boolean {
    const searchPatterns = [
      /search/i,
      /find/i,
      /look(?:ing)?\s+(?:for|up)/i,
      /previous|past|history/i,
      /when\s+did\s+(?:we|i)/i,
      /what\s+did\s+(?:we|i)\s+(?:discuss|talk|say)/i,
    ];
    return searchPatterns.some(p => p.test(message));
  }

  /**
   * Search meetings based on chat message
   */
  private async searchMeetingsForChat(message: string, meetingRepo: any): Promise<Meeting[]> {
    // Extract search terms
    const stopWords = ['search', 'find', 'look', 'for', 'up', 'the', 'a', 'an', 'with', 'about', 'meeting', 'meetings'];
    const terms = message
      .toLowerCase()
      .split(/\s+/)
      .filter(word => !stopWords.includes(word) && word.length > 2);

    const allMeetings = meetingRepo.findAll();

    // Score meetings by relevance
    const scored = allMeetings.map((m: Meeting) => {
      let score = 0;

      // Build searchable text including noteEntries
      const noteEntriesText = Array.isArray(m.noteEntries)
        ? m.noteEntries.map((entry: any) => entry.content || '').join(' ')
        : '';
      const searchableText = `${m.title || ''} ${m.summary || ''} ${m.notes || ''} ${noteEntriesText} ${m.notesMarkdown || ''}`.toLowerCase();

      for (const term of terms) {
        if (searchableText.includes(term)) {
          score += 1;
          // Boost for title matches
          if (m.title?.toLowerCase().includes(term)) score += 2;
        }
      }

      return { meeting: m, score };
    });

    return scored
      .filter((s: { score: number }) => s.score > 0)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, 5)
      .map((s: { meeting: Meeting }) => s.meeting);
  }

  /**
   * Detect if the query is about calendar/schedule optimization
   */
  private detectCalendarIntent(message: string): boolean {
    const calendarPatterns = [
      /sort\s+(?:my\s+)?calendar/i,
      /organize\s+(?:my\s+)?(?:calendar|schedule)/i,
      /optimize\s+(?:my\s+)?(?:calendar|schedule)/i,
      /upcoming\s+(?:week|meetings|schedule)/i,
      /next\s+(?:week|seven\s+days)/i,
      /calendar\s+(?:review|optimization|analysis)/i,
      /schedule\s+(?:review|optimization|analysis)/i,
      /free\s+time|free\s+slots|available\s+time/i,
      /meeting\s+conflicts/i,
      /back\s+to\s+back\s+meetings/i,
    ];
    return calendarPatterns.some(p => p.test(message));
  }

  /**
   * Fetch upcoming calendar events
   */
  private async fetchUpcomingCalendarEvents(): Promise<CalendarEvent[]> {
    try {
      const { calendarService } = getContainer();
      if (!calendarService) {
        logger.warn('Calendar service not available');
        return [];
      }

      const events = await calendarService.getUpcomingMeetings();
      logger.debug('Fetched upcoming calendar events', { count: events.length });
      return events;
    } catch (error) {
      logger.error('Failed to fetch calendar events', { error });
      return [];
    }
  }

  /**
   * Build calendar context for AI prompt
   */
  private buildCalendarContext(events: CalendarEvent[]): string {
    if (events.length === 0) {
      return 'No upcoming calendar events found.';
    }

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Filter to next 7 days
    const upcomingEvents = events.filter(e => {
      const eventStart = new Date(e.start);
      return eventStart >= now && eventStart <= sevenDaysFromNow;
    });

    if (upcomingEvents.length === 0) {
      return 'No calendar events in the next 7 days.';
    }

    // Sort by start time
    upcomingEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const formattedEvents = upcomingEvents.map((event, idx) => {
      const start = new Date(event.start);
      const end = new Date(event.end);

      // Format day and time
      const dayOfWeek = start.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

      // Calculate duration
      const durationMs = end.getTime() - start.getTime();
      const durationMin = Math.round(durationMs / (1000 * 60));

      const parts = [
        `[${idx + 1}] **${event.title || 'Untitled Event'}**`,
        `   ${dayOfWeek}, ${dateStr} at ${timeStr} (${durationMin} min)`,
      ];

      // Add attendee count if available
      if (event.attendees && event.attendees.length > 0) {
        const attendeeCount = event.attendees.length;
        // Note: CalendarEvent doesn't have organizer info in the type definition
        parts.push(`   Attendees: ${attendeeCount}`);
      }

      // Add location if available
      if (event.location) {
        parts.push(`   Location: ${event.location}`);
      }

      // Add description snippet if available
      if (event.description && event.description.length > 0) {
        const snippet = event.description.substring(0, 100);
        parts.push(`   Description: ${snippet}${event.description.length > 100 ? '...' : ''}`);
      }

      return parts.join('\n');
    }).join('\n\n');

    return `UPCOMING CALENDAR EVENTS (Next 7 Days):\nToday is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n\n${formattedEvents}`;
  }

  /**
   * Build meeting context specifically for chat
   */
  private buildMeetingContextForChat(meetings: Meeting[]): string {
    if (meetings.length === 0) {
      return 'No past meetings found with this person.';
    }

    return meetings.map((m, idx) => {
      const date = new Date(m.createdAt);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const dateStr = daysAgo === 0 ? 'Today' :
                      daysAgo === 1 ? 'Yesterday' :
                      daysAgo < 7 ? `${daysAgo} days ago` :
                      date.toLocaleDateString();

      const parts = [
        `[${idx + 1}] "${m.title || 'Untitled Meeting'}" (${dateStr})`,
      ];

      if (m.summary) {
        parts.push(`Summary: ${m.summary.substring(0, 200)}${m.summary.length > 200 ? '...' : ''}`);
      }

      if (m.actionItems && m.actionItems.length > 0) {
        parts.push(`Action Items: ${m.actionItems.slice(0, 3).join('; ')}`);
      }

      // Include relevant notes content - check noteEntries first (where manual notes are stored)
      let notesContent = '';
      if (Array.isArray(m.noteEntries) && m.noteEntries.length > 0) {
        // Combine all note entries
        notesContent = m.noteEntries
          .map((entry: any) => entry.content || '')
          .filter((c: string) => c.length > 0)
          .join('\n');
      } else if (m.notesMarkdown && typeof m.notesMarkdown === 'string') {
        notesContent = m.notesMarkdown;
      } else if (m.notes && typeof m.notes === 'string') {
        notesContent = m.notes;
      }

      if (notesContent.length > 0) {
        // Include more context - up to 800 chars for better AI understanding
        const notesPreview = notesContent.substring(0, 800).replace(/\n{3,}/g, '\n\n');
        parts.push(`Notes:\n${notesPreview}${notesContent.length > 800 ? '...' : ''}`);
      }

      return parts.join('\n');
    }).join('\n\n');
  }

  /**
   * Extract person name from message (even if not in people repo)
   */
  private extractPersonNameFromMessage(message: string): string | null {
    const personPatterns = [
      // "meeting with Sarah Pagely"
      /meeting with\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
      // "meeting Sarah Pagely" (without "with")
      /meeting\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
      // "talking to Sarah Pagely"
      /talking to\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
      // "referring to Sarah Pagely"
      /referring to\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
      // "know about Sarah Pagely" or "know before meeting Sarah"
      /know (?:about |before (?:meeting |talking to )?)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
      // "prep for Sarah" or "prepare for meeting with Sarah"
      /prep(?:are)?\s+(?:for\s+)?(?:my\s+)?(?:meeting\s+)?(?:with\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
      // "about Sarah Pagely"
      /about\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
      // "with Sarah Pagely?" at end
      /with\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\??$/i,
      // Capitalized proper name anywhere (First Last pattern) - fallback
      /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/,
    ];

    for (const pattern of personPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Skip common words that aren't names
        const skipWords = ['the', 'a', 'an', 'this', 'that', 'my', 'our', 'your', 'their', 'me', 'you', 'them'];
        if (skipWords.includes(name.toLowerCase())) {
          continue;
        }
        // Name should be at least 2 characters
        if (name.length >= 2) {
          return name;
        }
      }
    }
    return null;
  }

  /**
   * Search meetings by person name across all meeting content (title, notes, summary, transcript)
   */
  private async searchMeetingsByPersonName(personName: string, meetingRepo: any): Promise<Meeting[]> {
    const allMeetings = meetingRepo.findAll();
    const nameLower = personName.toLowerCase();
    const nameParts = nameLower.split(/\s+/).filter(p => p.length > 1);

    // Score meetings by how well they match the person name
    const scored = allMeetings.map((m: Meeting) => {
      let score = 0;

      // Build searchable text from all meeting content
      const searchableText = [
        m.title || '',
        m.summary || '',
        typeof m.notes === 'string' ? m.notes : '',
        // Include noteEntries content (where manual notes are stored)
        Array.isArray(m.noteEntries)
          ? m.noteEntries.map((entry: any) => entry.content || '').join(' ')
          : '',
        // Include notesMarkdown if available
        m.notesMarkdown || '',
        // Include transcript text if available
        Array.isArray(m.transcript)
          ? m.transcript.map((s: any) => s.text || '').join(' ')
          : '',
        // Include attendee emails
        Array.isArray(m.attendeeEmails) ? m.attendeeEmails.join(' ') : '',
        // Include people array
        Array.isArray(m.people)
          ? m.people.map((p: any) => `${p.name || ''} ${p.email || ''}`).join(' ')
          : '',
      ].join(' ').toLowerCase();

      // Check for full name match
      if (searchableText.includes(nameLower)) {
        score += 10;
      }

      // Check for partial name matches (first name, last name)
      for (const part of nameParts) {
        if (searchableText.includes(part)) {
          score += 3;
        }
      }

      // Boost for title matches
      if (m.title?.toLowerCase().includes(nameLower)) {
        score += 5;
      }

      return { meeting: m, score };
    });

    return scored
      .filter((s: { score: number }) => s.score > 0)
      .sort((a: { score: number; meeting: Meeting }, b: { score: number; meeting: Meeting }) => {
        // Sort by score first, then by date
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.meeting.createdAt).getTime() - new Date(a.meeting.createdAt).getTime();
      })
      .slice(0, 8)
      .map((s: { meeting: Meeting }) => s.meeting);
  }
}

interface ParticipantContext {
  participant: PrepParticipant;
  meetings: Meeting[];
  strength: 'strong' | 'weak' | 'org-only' | 'none';
  recentTopics: string[];
  keyPoints: string[];
}

interface OrgHistoryResult {
  anyOrgMeetings: boolean;
  lastOrgMeeting?: Date;
  meetingCount: number;
}

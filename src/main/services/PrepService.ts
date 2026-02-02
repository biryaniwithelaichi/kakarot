import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';
import { CRMEmailMatcher } from './CRMEmailMatcher';
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
    return meetings.filter((meeting) => {
      // Rule 1: Filter by exact email
      if (participant.email) {
        if (meeting.attendeeEmails?.includes(participant.email)) {
          return true;
        }
      }

      // Rule 2: Filter by domain if email is null but domain exists
      if (!participant.email && participant.domain) {
        const domainMatch = meeting.attendeeEmails?.some((email) =>
          email.endsWith(`@${participant.domain}`)
        );
        if (domainMatch) {
          return true;
        }
      }

      // Rule 3: Treat as cold meeting if no email or domain
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
        return `
**${participant.name} (${participant.email || 'no-email'}) [${strength}]**
- Organization: ${participant.company || 'Unknown'}
- Domain: ${participant.domain || 'N/A'}
- First meeting: ${isFirstMeeting ? 'YES - No prior history' : 'NO'}
- Meeting history: ${meetings.length} meetings
- Recent Topics: ${recentTopics.length > 0 ? recentTopics.join(', ') : 'None available'}
- Key Points: ${keyPoints.length > 0 ? keyPoints.join(', ') : 'None available'}
`;
      })
      .join('\n');

    return `You are a meeting preparation assistant. Generate a factual briefing based ONLY on provided data.

CRITICAL RULES:
- ONLY include information you are highly confident about (70%+ certainty)
- If you lack sufficient context about a participant, mark their history_strength as "none" or "weak"
- DO NOT make assumptions about topics, relationships, or context that aren't clearly evident
- When uncertain, use neutral language like "Consider discussing..." instead of definitive statements
- If there's NO past meeting data, keep talking_points generic and professional
- Default to "No recent context available" rather than inventing details
- For first-time meetings, explicitly state "This is your first meeting with [name]" in background

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
        name: p.name || input.participants[index]?.name || 'Unknown',
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
  ): Promise<ParticipantPersona> {
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

    return 'Unknown';
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

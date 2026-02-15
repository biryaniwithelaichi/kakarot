// Meeting and transcript types

export interface NoteEntry {
  id: string;
  content: string;
  type: 'manual' | 'generated'; // manual = typed by user, generated = from AI
  createdAt: Date;
  source?: 'upcoming' | 'live'; // where it was created
}

// Structured meeting notes - Granola-style hierarchical bullets

export interface NoteBullet {
  text: string;              // Main bullet point
  subBullets?: string[];     // Nested details, context, alternatives, reasoning
}

export interface NoteTopic {
  title: string;             // Section header (e.g., "Stripe Payment Integration")
  bullets: NoteBullet[];     // Hierarchical bullets with sub-bullets
}

export interface NoteActionItem {
  owner: string; // Person responsible or 'TBD'
  task: string; // Concrete, actionable task description
  when: string; // Deadline or timeframe (e.g., "By Friday", "Next sprint", "Not specified")
}

export interface NoteRisk {
  text: string; // The risk or open question
  owner: string; // Who is tracking this or 'TBD'
  nextSteps: string; // How to address or 'Not specified'
}

export interface NoteDecision {
  text: string; // What was decided
  rationale: string[]; // Why (1-3 reasons)
}

export interface GeneratedStructuredNotes {
  title: string;
  overview: string; // 2-3 sentence summary
  date: string; // YYYY-MM-DD or 'Not specified'
  participants: string[];
  topics: NoteTopic[];
  actionItems: NoteActionItem[];
  risks: NoteRisk[];
  decisions: NoteDecision[];
  notesMarkdown: string; // Full rendered markdown for fallback/export
}

export interface Person {
  email: string; // Primary identifier
  name?: string; // Extracted from calendar or user input
  lastMeetingAt: Date;
  meetingCount: number;
  totalDuration: number; // Total minutes met
  notes?: string; // User-added context about this person
  organization?: string;
}

export interface Branch {
  id: string;
  name: string; // e.g., "Leadership Coaching", "Sort my Calendar"
  description: string; // Short description of what this branch does
  explanation: string; // Longer paragraph explaining how it helps
  prompt: string; // The LLM prompt template to execute
  thumbnailUrl?: string; // Path to thumbnail image
  createdAt: Date;
  updatedAt: Date;
}

export interface Meeting {
  id: string;
  title: string;
  createdAt: Date;
  endedAt: Date | null;
  duration: number; // in seconds
  transcript: TranscriptSegment[];
  summary?: string | null;
  actionItems: string[];
  participants: string[]; // Deprecated: use attendeeEmails
  attendeeEmails: string[]; // Email addresses from calendar
  // Note entries (accumulated with timestamps)
  noteEntries: NoteEntry[];
  // Optional generated notes fields (legacy, for backward compatibility)
  overview: string | null;
  notesMarkdown: string | null;
  notesPlain: string | null;
  notes: unknown | null;
  chapters: unknown[];
  people: unknown[];
}

export interface TranscriptWord {
  text: string;
  confidence: number;
  isFinal: boolean;
  start: number; // ms
  end: number; // ms
}

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number; // ms from start
  source: 'mic' | 'system'; // mic = user, system = others
  confidence: number;
  isFinal: boolean;
  words: TranscriptWord[];
  speakerId?: string; // for future diarization
}

export interface Callout {
  id: string;
  meetingId: string;
  triggeredAt: Date;
  question: string;
  context: string;
  suggestedResponse: string;
  sources: CalloutSource[];
  dismissed: boolean;
}

export interface CalloutSource {
  type: 'meeting' | 'file';
  title: string;
  excerpt: string;
  meetingId?: string;
  filePath?: string;
}

// Recording state
export type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';

export interface AudioLevels {
  mic: number; // 0-1
  system: number; // 0-1
}

// Settings
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  scope?: string;
  tokenType?: string;
  idToken?: string;
  email?: string;
  // User profile info
  userName?: string;
  userEmail?: string;
  userPhoto?: string;
}

export interface ICloudCredentials {
  appleId: string;
  appPassword: string;
  calendarHomeUrl?: string;
}

export interface CalendarConnections {
  google?: OAuthTokens;
  outlook?: OAuthTokens;
  icloud?: ICloudCredentials;
}

export type TranscriptionProvider = 'assemblyai' | 'deepgram';

export type CRMProvider = 'salesforce' | 'hubspot';
export type CRMNotesBehavior = 'always' | 'ask';

export interface SalesforceOAuthToken {
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  expiresAt: number;
  connectedAt: number;
}

export interface HubSpotOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  connectedAt: number;
}

export interface CRMConnections {
  salesforce?: SalesforceOAuthToken;
  hubspot?: HubSpotOAuthToken;
}

export interface AppSettings {
  assemblyAiApiKey: string;
  deepgramApiKey: string;
  openAiApiKey: string;
  openAiBaseUrl: string;
  openAiModel: string;
  knowledgeBasePath: string;
  autoDetectQuestions: boolean;
  showFloatingCallout: boolean;
  transcriptionLanguage: string;
  // Hosted token support
  useHostedTokens: boolean;
  authApiBaseUrl: string;
  hostedAuthToken: string;
  // User profile
  userProfile?: {
    name?: string;
    email?: string;
    photo?: string;
    position?: string;
    company?: string;
    provider?: 'google' | 'outlook' | 'icloud';
  };
  // Calendar connections and optional OAuth config
  calendarConnections: CalendarConnections;
  googleCalendarClientId?: string;
  googleCalendarClientSecret?: string;
  outlookCalendarClientId?: string;
  outlookCalendarClientSecret?: string;
  icloudCalendarUsername?: string;
  icloudCalendarPassword?: string; // App-specific password
  // Calendar event mappings
  calendarEventMappings?: Record<string, CalendarEventMapping>;
  // Visible calendars per provider
  visibleCalendars?: {
    google?: string[];
    outlook?: string[];
    icloud?: string[];
  };
  // CRM Integration
  crmConnections?: CRMConnections;
  crmNotesBehavior?: CRMNotesBehavior;
  // CRM OAuth credentials
  crmOAuthSalesforceClientId?: string;
  crmOAuthSalesforceClientSecret?: string;
  crmOAuthHubSpotClientId?: string;
  crmOAuthHubSpotClientSecret?: string;
  // Custom meeting objectives for PrepView (legacy - string array)
  customMeetingTypes?: string[];
  // Custom meeting objectives v2 (structured)
  customMeetingTypesV2?: CustomMeetingType[];
  // Standard meeting objective overrides (user modifications)
  standardMeetingTypeOverrides?: StandardMeetingTypeOverride[];
  // Migration flag
  customMeetingTypesMigrated?: boolean;
  // Meeting objective usage tracking (for sorting by last used)
  meetingObjectiveUsage?: MeetingObjectiveUsage[];
  // UI preferences
  showLiveMeetingIndicator?: boolean;
  openOnLogin?: boolean;
  // Auto-sync timestamps
  lastCalendarContactsSync?: number; // epoch ms of last auto/manual sync
}

// Default settings for renderer (without process.env dependencies)
// API keys are now managed server-side via the Treeto backend
export const DEFAULT_SETTINGS: AppSettings = {
  // Deprecated: API keys are now server-side
  assemblyAiApiKey: '',
  deepgramApiKey: '',
  openAiApiKey: '',
  openAiBaseUrl: '',
  openAiModel: '',
  // Active settings
  knowledgeBasePath: '',
  autoDetectQuestions: true,
  showFloatingCallout: true,
  transcriptionLanguage: 'en',
  showLiveMeetingIndicator: true,
  openOnLogin: false,
  // Deprecated: Hosted tokens replaced by backend proxy
  useHostedTokens: false,
  authApiBaseUrl: '',
  hostedAuthToken: '',
  calendarConnections: {},
};

// Mapping between calendar events and notes/recordings
export interface CalendarEventMapping {
  calendarEventId: string;
  meetingId?: string;
  notesId?: string;
  linkedAt: number;
  provider: 'google' | 'outlook' | 'icloud';
}

// Transcript Deep Dive Analysis (3-part explanation)
export interface TranscriptDeepDiveResult {
  context: string;      // The Context: AI narrative explaining what was being discussed
  verbatimQuote: string; // The Verbatim Quote: Exact segment from transcript
  implication: string;   // The Implication: Result or next step
  segmentId: string;     // Reference back to the segment
  timestamp: number;     // Timestamp in the meeting
}

// Notes Deep Dive Analysis (for AI-generated notes)
export interface NotesDeepDiveResult {
  context: string;       // The Context: AI narrative explaining what was being discussed
  verbatimQuote: string; // The Verbatim Quote: Exact quote(s) from transcript
  implication: string;   // The Implication: Result or next step
  noteContent: string;   // The original note content
}

// Enhanced Deep Dive (Granola-style zoom with semantic search)
export interface DeepDiveQuote {
  speaker: string;       // Speaker name or 'Unknown'
  timestamp: string;     // HH:MM:SS format
  quote: string;         // Exact transcript text
}

export interface EnhancedDeepDiveResult {
  summary: string;                 // 2-4 sentence high-level overview
  keyPoints: string[];             // 3-7 bullet points of key information
  notableQuotes: DeepDiveQuote[];  // 1-3 notable quotes with context
  transcriptSlice?: TranscriptSegment[]; // Raw transcript segments (for transcript tab)
  totalTokens: number;             // For decision logic
  isRawTranscript: boolean;        // True if showing raw transcript, false if summarized
}

// Transcript Chunk (for semantic search)
export interface TranscriptChunk {
  id: string;
  meetingId: string;
  startTime: number;     // milliseconds from meeting start
  endTime: number;       // milliseconds from meeting start
  text: string;          // Combined text from segments
  tokenCount: number;
  segmentIds: string[];  // Original segment IDs
  speakerSet: string[];  // Unique speakers in this chunk
  embedding?: number[];  // Vector embedding (not stored in DB as array)
  createdAt: Date;
}

// Deep Dive Cache Entry
export interface DeepDiveCacheEntry {
  id: string;
  meetingId: string;
  noteBlockHash: string; // SHA256 hash of canonicalized note text
  chunkIds: string[];    // Relevant chunk IDs
  modelVersion: string;  // e.g., 'gpt-4o'
  promptVersion: string; // e.g., 'v1'
  summaryJson: EnhancedDeepDiveResult;
  createdAt: Date;
  updatedAt: Date;
}

// IPC payloads
export interface TranscriptUpdate {
  segment: TranscriptSegment;
  meetingId: string;
}

// Calendar
export interface CalendarAttendee {
  email: string;
  name?: string; // displayName from Google or name from Outlook
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  provider: 'google' | 'outlook' | 'icloud' | 'unknown';
  location?: string;
  attendees?: CalendarAttendee[];
  description?: string;
  status?: string;
  isCancelled?: boolean;
}

// Structured custom meeting objective (for Interact section)
export interface CustomMeetingType {
  id: string;
  name: string;
  description?: string;
  attendeeRoles: string[]; // e.g., ["Engineering Lead", "Product Manager"]
  isExternal: boolean; // internal vs external meeting
  objectives: string[]; // expected outcomes
  customPrompt?: string; // user-defined AI focus areas
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number; // timestamp of last use
}

// Tracks last used time for standard meeting objectives
export interface MeetingObjectiveUsage {
  id: string; // standard type id or custom type id
  lastUsedAt: number;
}

// Standard meeting type with user modifications
export interface StandardMeetingTypeOverride {
  id: string; // matches predefined type id
  description?: string;
  attendeeRoles?: string[];
  objectives?: string[];
  customPrompt?: string;
  updatedAt: number;
}

// Task commitment from past meetings
export interface TaskCommitment {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: Date;
  participantEmail: string; // who the task involves
  description: string;
  completed: boolean;
  completedAt?: Date;
  source: 'action_item' | 'transcript_extraction';
}

// Company info from website fetch
export interface CompanyInfo {
  domain: string;
  name?: string;
  description?: string;
  website: string;
  industry?: string;
  fetchedAt: number;
}

// Enhanced participant prep output with confidence
export interface ParticipantPrepData {
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

// Meeting prep result structure (legacy - keeping for backward compatibility)
export interface MeetingPrepResult {
  meeting: {
    type: string;
    objective?: string;
    duration_minutes: number;
  };
  generated_at: string;
  participants: ParticipantPrepData[];
  agenda: {
    opening: string;
    key_topics: string[];
    closing: string;
  };
  success_metrics: string[];
  risk_mitigation: string[];
}

// ============================================================
// NEW PREP TYPES - Revamped Meeting Prep Summary
// ============================================================

/** Participant persona derived from past interactions and CRM data */
export type ParticipantPersona = 'Technical' | 'Executive' | 'Skeptic' | 'Champion';

/** Sentiment analysis result for meeting mood */
export type MeetingSentiment = 'Positive' | 'Neutral' | 'Tense';

/** Block A: Participant Intelligence (The "Who") */
export interface ParticipantIntel {
  persona: ParticipantPersona | null;  // null when no persona can be derived - absence of data = absence of UI
  personalFacts: string[];      // From past small talk or external sources
  recentActivity: string[];     // Support tickets, contract requests, etc.
  crmRole?: string;             // Decision Maker, Influencer, etc. from CRM
  missedMeetings?: number;      // Count of recent meetings they didn't join
}

/** Block B: Action Item with completion tracking */
export interface ActionItemStatus {
  id: string;
  description: string;
  assignedTo: 'them' | 'us';
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  completed: boolean;
  completedAt?: string;
  source: 'meeting_notes' | 'transcript' | 'crm';
}

/** Timeline event source types */
export type TimelineEventType = 'meeting' | 'email' | 'note' | 'deal_update' | 'support_ticket' | 'call';
export type TimelineEventSource = 'Meeting Notes' | 'HubSpot' | 'Salesforce' | 'Email' | 'Calendar';

/** Block C: Timeline Event */
export interface TimelineEvent {
  id: string;
  date: string;
  type: TimelineEventType;
  source: TimelineEventSource;
  summary: string;
  sentiment?: MeetingSentiment;
  metadata?: {
    dealStage?: string;
    emailSubject?: string;
    meetingTitle?: string;
  };
}

/** CRM Deal/Opportunity Snapshot */
export interface CRMSnapshot {
  dealId?: string;
  dealName?: string;
  dealValue?: number;
  dealStage?: string;
  closeDate?: string;
  blockers?: string[];
  lastActivityDate?: string;
  source: 'hubspot' | 'salesforce';
}

/** Confidence metrics with source attribution */
export interface ConfidenceMetrics {
  score: number;  // 0-100
  sources: {
    meetings: number;
    emails: number;
    crmNotes: number;
    calls: number;
  };
  explanation: string;  // e.g., "Data from: 2 Meetings, 1 Email"
}

/** Last seen context for a participant */
export interface LastSeenContext {
  daysAgo: number;
  date: string;
  topic: string;
  sentiment: MeetingSentiment;
  meetingId?: string;
}

/** Unresolved thread from past meetings */
export interface UnresolvedThread {
  id: string;
  description: string;
  originMeetingId: string;
  originMeetingDate: string;
  originMeetingTitle: string;
  promisedBy: 'them' | 'us';
  source: 'meeting_notes' | 'crm_email';
}

/** NEW: Enhanced participant data for revamped prep */
export interface EnhancedPrepParticipant {
  name: string;
  email: string | null;

  // Last Seen Context
  lastSeen?: LastSeenContext;

  // Block A: "The Who" (Participant Intel)
  intel: ParticipantIntel;

  // Block B: "The History" (Paper Trail)
  actionItems: ActionItemStatus[];

  // Block C: Timeline
  timeline: TimelineEvent[];

  // CRM Snapshot
  crmSnapshot?: CRMSnapshot;

  // Unresolved Threads
  unresolvedThreads: UnresolvedThread[];

  // Confidence with attribution
  confidence: ConfidenceMetrics;

  // Is this first meeting?
  isFirstMeeting: boolean;

  // Company info (fetched separately)
  companyInfo?: CompanyInfo;
}

/** NEW: Revamped Meeting Prep Result */
export interface EnhancedMeetingPrepResult {
  meeting: {
    type: string;
    objective?: string;
  };
  generatedAt: string;
  participants: EnhancedPrepParticipant[];
}

/** CRM Email Activity */
export interface CRMEmailActivity {
  id: string;
  subject: string;
  snippet?: string;
  date: string;
  direction: 'inbound' | 'outbound';
  source: 'hubspot' | 'salesforce';
}

/** CRM Note */
export interface CRMNote {
  id: string;
  content: string;
  date: string;
  source: 'hubspot' | 'salesforce';
}

/** CRM Contact Data (aggregated from HubSpot or Salesforce) */
export interface CRMContactData {
  contactId: string;
  email: string;
  name?: string;
  jobTitle?: string;
  role?: string;  // Decision Maker, Influencer, etc.
  source: 'hubspot' | 'salesforce';
  deals: CRMSnapshot[];
  emails: CRMEmailActivity[];
  notes: CRMNote[];
  lastActivityDate?: string;
}

// ============================================================
// DYNAMIC BRIEF SYSTEM - Signal-driven, role-agnostic prep
// ============================================================

/** Signal source for importance scoring */
export type SignalSource = 'calendar' | 'crm' | 'meetings' | 'feedback';

/** Individual signal with normalized score and learnable weight */
export interface SignalScore {
  source: SignalSource;
  category: string;           // e.g., 'deal_value', 'recency', 'engagement'
  rawValue: unknown;
  normalizedScore: number;    // 0-1 normalized
  weight: number;             // Starts at 1.0, adjusted by feedback
}

/** Dynamic insight - appears based on relevance, not fixed structure */
export interface PrepInsight {
  id: string;
  category: string;           // Dynamic: 'pending_action', 'risk', 'opportunity', 'heads_up', 'deal', 'context'
  content: string;
  priority: number;           // 0-100, determines display order
  source: SignalSource | 'inferred';
  actionable: boolean;        // Is this something user should act on?
  metadata?: Record<string, unknown>;
}

/** Dynamic brief - sections appear based on relevance */
export interface DynamicBrief {
  headline: string;                    // One-liner summary
  insights: PrepInsight[];             // Ranked by priority, grouped by category in UI
  suggestedActions: string[];          // Top 3-5 things to do
  bottomLine: string;                  // What success looks like
}

/** Pending actions separated by ownership */
export interface PendingActions {
  theyOweUs: ActionItemStatus[];
  weOweThem: ActionItemStatus[];
}

/** CRM validation result - cross-check meeting claims against CRM data */
export interface CRMValidation {
  field: string;                  // e.g., "deal_stage", "close_date", "decision_maker"
  meetingClaim: string;           // What the meeting said
  crmValue: string;               // What CRM says
  matches: boolean;
  discrepancyNote?: string;       // "Meeting mentioned closing Q1, but CRM shows Q2"
}

// ============================================================
// MULTI-PERSON SYNTHESIS - Cross-participant analysis
// ============================================================

/** Individual topic in synthesis output */
export interface SynthesisTopic {
  topic: string;
  rationale: string;              // Includes inline citations, e.g. "discussed in Q4 Planning (Dec 15)"
}

/** Synthesis result for multi-person prep */
export interface MeetingSynthesis {
  likelyTopics: SynthesisTopic[];
  connectingThreads: string[];
  relationshipType: 'teammates' | 'cross-functional' | 'external' | 'unknown';
  forwardActions: string[];       // Forward-looking prep points
}

/** Inferred meeting objective (for hybrid mode) */
export interface InferredObjective {
  suggestedType: string;          // e.g., "deal_progression", "technical_review", "relationship_check"
  confidence: number;             // 0-100
  reasoning: string;              // Why this was inferred
  matchedCustomType?: string;     // ID of matched CustomMeetingType if any
  userCanOverride: boolean;
}

/** User feedback on prep insights for learning */
export interface InsightFeedback {
  id: string;
  insightId: string;
  insightCategory: string;
  feedback: 'useful' | 'not_useful' | 'dismissed';
  participantEmail?: string;
  timestamp: string;
}

/** Learned signal weight from feedback */
export interface SignalWeight {
  id: string;
  category: string;               // e.g., 'deal_value', 'recency', 'pending_action'
  weight: number;                 // 0-2 (1.0 = default, higher = more important)
  sampleCount: number;            // How many feedback samples informed this
  updatedAt: string;
}

/** Context for prep generation */
export interface PrepContext {
  calendarEvent?: CalendarEvent;
  objective?: CustomMeetingType | null;
  inferredObjective?: InferredObjective;
  meetings: Meeting[];
  crm: CRMContactData | null;
  feedbackWeights: Record<string, number>;
}

/** Result of dynamic prep generation */
export interface DynamicPrepResult {
  meeting: {
    type: string;
    objective?: string;
    inferred: boolean;            // Was objective inferred vs selected?
  };
  generatedAt: string;
  participants: DynamicPrepParticipant[];
  synthesis?: MeetingSynthesis;   // Cross-participant analysis (only for 2+ participants)
}

/** Enhanced participant data for dynamic prep */
export interface DynamicPrepParticipant {
  name: string;
  email: string | null;

  // Signal scores that drove this prep
  signals: SignalScore[];
  computedPriority: number;       // 0-100 composite score

  // Dynamic brief for this participant
  brief: DynamicBrief;

  // Pending actions separated by ownership
  pendingActions: PendingActions;

  // CRM validation results (if any discrepancies)
  crmValidations: CRMValidation[];

  // Existing fields (backward compatible)
  lastSeen?: LastSeenContext;
  intel: ParticipantIntel;
  timeline: TimelineEvent[];
  crmSnapshot?: CRMSnapshot;
  confidence: ConfidenceMetrics;
  isFirstMeeting: boolean;
  companyInfo?: CompanyInfo;
}

// ============================================================
// CONVERSATIONAL PREP - Granola-style natural output
// ============================================================

/** Citation for fact-anchoring in conversational prep */
export interface PrepCitation {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  snippet: string;
}

/** Key project extracted from meeting history */
export interface ProjectContext {
  name: string;
  status: string;
  issues: string[];
  nextSteps: string[];
  lastDiscussed: string;
  citations: PrepCitation[];
}

/** Ownership-based action items for conversational prep */
export interface OwnershipActions {
  waitingOnThem: Array<{
    description: string;
    citation: PrepCitation;
    daysOverdue?: number;
  }>;
  youOweThem: Array<{
    description: string;
    citation: PrepCitation;
    daysOverdue?: number;
  }>;
}

/** Questions grounded in past context */
export interface SuggestedQuestion {
  question: string;
  reasoning: string;
  citation?: PrepCitation;
}

/** Inferred trait with evidence */
export interface InferredTrait {
  trait: string;
  evidence: string;
  citation?: PrepCitation;
}

/** Conversational brief for one participant */
export interface ConversationalParticipantBrief {
  name: string;
  email: string | null;
  keyProjects?: ProjectContext[];
  quickQuestions?: SuggestedQuestion[];
  theirStrengths?: InferredTrait[];
  ownershipActions?: OwnershipActions;
  headline: string;
  dataQuality: 'rich' | 'moderate' | 'sparse';
  meetingCount: number;
  lastMeetingDate?: string;
}

/** Main output for conversational prep */
export interface ConversationalPrepResult {
  participant: ConversationalParticipantBrief;
  generatedAt: string;
  markdownBrief: string;
  meetingsAnalyzed: number;
  processingTimeMs: number;
}

/** Quick prep input */
export interface QuickPrepInput {
  personQuery: string;
  calendarEventId?: string;
}

// ============================================================
// CONVERSATIONAL PREP CHAT TYPES
// ============================================================

/** Single message in a prep chat conversation */
export interface PrepChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Referenced meetings for citations */
  meetingReferences?: { meetingId: string; title: string; date: string }[];
  /** Suggested follow-up actions */
  suggestedActions?: string[];
  /** Extended thinking/reasoning (chain-of-thought) for assistant messages */
  thinking?: string;
  /** Thinking duration in milliseconds */
  thinkingDuration?: number;
}

/** Full conversation state for prep chat */
export interface PrepConversation {
  id: string;
  messages: PrepChatMessage[];
  createdAt: string;
  updatedAt: string;
  /** Context about the participant being discussed */
  participantContext?: {
    name: string;
    email: string | null;
    organization: string | null;
    meetingIds: string[];
  };
}

// ============================================================
// QUERY INTELLIGENCE TYPES
// ============================================================

/** Entity type extracted from user query */
export type ExtractedEntityType = 'person' | 'company' | 'project' | 'meeting' | 'topic' | 'unknown';

/** User intent extracted from query */
export type QueryIntent =
  | 'prep'           // Preparing for a meeting
  | 'status'         // Status update on something
  | 'contact_info'   // Looking for email, phone, etc.
  | 'follow_up'      // Following up on action items
  | 'context'        // General context/background
  | 'comparison'     // Comparing entities
  | 'issues'         // Problems or concerns
  | 'action_items'   // What needs to be done
  | 'discovery'      // Learning about someone/something
  | 'unknown';

/** Temporal reference in query */
export type TemporalReference = 'next' | 'last' | 'recent' | 'today' | 'tomorrow' | 'this_week' | 'last_week' | 'specific' | null;

/** LLM-extracted entity from user query */
export interface ExtractedEntity {
  /** Primary entity name (person, company, project name) */
  entity: string | null;
  /** Type of entity */
  type: ExtractedEntityType;
  /** User's intent */
  intent: QueryIntent;
  /** Temporal reference if any */
  temporal: TemporalReference;
  /** Resolved implicit references (e.g., "they" → "Devin") */
  implicitResolutions: Record<string, string>;
  /** Confidence score 0-1 */
  confidence: number;
  /** Additional context clues detected */
  contextClues: {
    urgency?: 'low' | 'medium' | 'high';
    emotionalTone?: 'neutral' | 'positive' | 'negative' | 'frustrated' | 'excited';
    relationshipType?: 'client' | 'prospect' | 'partner' | 'colleague' | 'unknown';
  };
}

/** Query type classification for intelligent response handling */
export type QueryType = 'retrieval' | 'generative' | 'hybrid' | 'greeting';

/** Classified query with metadata */
export interface ClassifiedQuery {
  type: QueryType;
  /** Original user message */
  originalMessage: string;
  /** Extracted search terms for retrieval */
  searchTerms: string[];
  /** Parsed date range if temporal expressions found */
  dateRange?: {
    start: Date | null;
    end: Date | null;
    description: string; // e.g., "last week", "yesterday"
  };
  /** Confidence in classification (0-1) */
  confidence: number;
  /** Reasoning for classification */
  reasoning: string;
}

/** User context for personalized responses */
export interface UserContext {
  /** User's name */
  name: string | null;
  /** User's email */
  email: string | null;
  /** User's job title/position */
  position: string | null;
  /** User's company */
  company: string | null;
  /** Was user a participant in the meeting being discussed? */
  wasAttendee?: boolean;
}

/** Input for sending a prep chat message */
export interface PrepChatInput {
  message: string;
  /** Conversation ID for follow-ups */
  conversationId?: string;
  /** Additional context */
  context?: {
    personQuery?: string;
    meetingIds?: string[];
  };
}

/** Response from prep chat */
export interface PrepChatResponse {
  conversationId: string;
  message: PrepChatMessage;
  /** Updated conversation state */
  conversation?: PrepConversation;
}

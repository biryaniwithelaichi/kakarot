// Meeting and transcript types

export interface NoteEntry {
  id: string;
  content: string;
  type: 'manual' | 'generated'; // manual = typed by user, generated = from AI
  createdAt: Date;
  source?: 'upcoming' | 'live'; // where it was created
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

// Meeting prep result structure
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


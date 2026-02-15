import type { AppSettings } from '@shared/types';

// Default settings for the application.
// API keys are now managed server-side via the Treeto backend.
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

// AI model identifiers
export const AI_MODELS = {
  GPT4O: 'gpt-4o',
  EMBEDDING_SMALL: 'text-embedding-3-small',
} as const;

// Question detection patterns
export const QUESTION_PATTERNS = [
  /\?$/,
  /^(what|where|when|why|how|who|which|can|could|would|should|is|are|do|does|did|have|has|will)/i,
  /^(tell me|explain|describe|clarify)/i,
  /^(do you know|can you tell|could you explain)/i,
];

// Callout service configuration
export const CALLOUT_CONFIG = {
  MAX_CONTEXT_SEGMENTS: 50,
  MAX_PAST_MEETINGS: 3,
  MAX_KNOWLEDGE_RESULTS: 3,
} as const;

// Callout timer configuration (attention detection)
export const CALLOUT_TIMER_CONFIG = {
  /** Delay before generating callout after question detected (ms) */
  DELAY_MS: 5000,
  /** Minimum words in mic transcript to cancel pending callout */
  MIN_RESPONSE_WORDS: 3,
} as const;

// Feature flags toggled per release; callouts remain under development.
export const FEATURE_FLAGS = {
  enableCallouts: false,
} as const;

// Audio configuration
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 48000,
  CHUNK_DURATION_MS: 256,
  CHANNELS: 1 as const,
  BIT_DEPTH: 16 as const,
  PACKET_LOG_INTERVAL: 100, // Log every N packets
} as const;

// Acoustic Echo Cancellation configuration (WebRTC AEC3)
export const AEC_CONFIG = {
  /** Enable AEC processing (will still auto-bypass if native module unavailable) */
  ENABLED: true,
  /** Number of audio channels (1 = mono) */
  NUM_CHANNELS: 1,
  /** Automatically bypass AEC when headphones are detected */
  HEADPHONE_BYPASS: true,
  /** Emit metrics every N frames */
  METRICS_INTERVAL_FRAMES: 100,
} as const;

// Export configuration
export const EXPORT_CONFIG = {
  EXPORT_DIR: 'exports',
  DATA_DIR: 'data',
} as const;

export function matchesQuestionPattern(text: string): boolean {
  return QUESTION_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

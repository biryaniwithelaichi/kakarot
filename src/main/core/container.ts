import { MeetingRepository, CalloutRepository, SettingsRepository, PeopleRepository, BranchRepository } from '../data/repositories';
import { BackendAIProvider } from '../providers/BackendAIProvider';
import { initializeBackendAPI, getBackendAPI, type BackendConfig } from '../providers/BackendAPIProvider';
import type { AIProvider } from '../providers/OpenAIProvider';
import { createLogger } from './logger';
import { CalendarService } from '../services/CalendarService';
import { CalloutService } from '../services/CalloutService';
import { NoteGenerationService } from '../services/NoteGenerationService';
import { HubSpotService } from '../services/HubSpotService';
import { SalesforceService } from '../services/SalesforceService';
import { MeetingNotificationService } from '../services/MeetingNotificationService';
import { PrepService } from '../services/PrepService';
import { CompanyInfoService } from '../services/CompanyInfoService';

const logger = createLogger('Container');

export interface AppContainer {
  meetingRepo: MeetingRepository;
  calloutRepo: CalloutRepository;
  settingsRepo: SettingsRepository;
  peopleRepo: PeopleRepository;
  branchRepo: BranchRepository;
  aiProvider: AIProvider | null;
  calendarService: CalendarService;
  calloutService: CalloutService;
  noteGenerationService: NoteGenerationService;
  hubSpotService: HubSpotService;
  salesforceService: SalesforceService;
  meetingNotificationService: MeetingNotificationService;
  prepService: PrepService;
  companyInfoService: CompanyInfoService;
  backendConfig: BackendConfig | null;
}

let container: AppContainer | null = null;

/**
 * Initialize the application container.
 * This is now an async function to support fetching config from the backend.
 */
export async function initializeContainer(): Promise<AppContainer> {
  const meetingRepo = new MeetingRepository();
  const calloutRepo = new CalloutRepository();
  const settingsRepo = new SettingsRepository();
  const peopleRepo = new PeopleRepository();
  const branchRepo = new BranchRepository();
  const calendarService = new CalendarService(settingsRepo);

  // Inject peopleRepo into meetingRepo for attendee syncing
  meetingRepo.setPeopleRepository(peopleRepo);

  // Inject People API fetcher for smart name resolution
  meetingRepo.setPeopleApiFetcher((email: string) =>
    calendarService.fetchPersonNameFromGoogle(email)
  );

  // Initialize default settings
  settingsRepo.initializeDefaults();

  // Get settings
  let settings = settingsRepo.getSettings();

  // Sanitize: perma-remove Birthdays calendar from visible calendars if previously stored
  try {
    const BIRTHDAYS_ID = 'addressbook#contacts@group.v.calendar.google.com';
    const googleVisible = settings.visibleCalendars?.google || [];
    const hasBirthdays = googleVisible.some((id) => typeof id === 'string' && id.includes(BIRTHDAYS_ID));
    if (hasBirthdays) {
      const filtered = googleVisible.filter((id) => !id.includes(BIRTHDAYS_ID));
      const nextVisible = { ...(settings.visibleCalendars || {}), google: filtered };
      settingsRepo.updateSettings({ visibleCalendars: nextVisible });
      settings = settingsRepo.getSettings();
      logger.info('Sanitized visible calendars: removed Birthdays calendar');
    }
  } catch (err) {
    logger.warn('Failed to sanitize visible calendars', { error: (err as Error).message });
  }

  // Initialize the backend API
  initializeBackendAPI();
  logger.info('Backend API initialized');

  // Fetch configuration from the backend
  let backendConfig: BackendConfig | null = null;
  try {
    backendConfig = await getBackendAPI().fetchConfig();
    logger.info('Backend config fetched', { features: backendConfig.features });
  } catch (error) {
    logger.error('Failed to fetch backend config', error as Error);
    // Continue with null config - features will be disabled
  }

  // Initialize AI provider using the backend
  // AI is routed through the backend, no local API keys needed
  let aiProvider: AIProvider | null = null;

  if (backendConfig?.features.ai) {
    aiProvider = new BackendAIProvider();
    logger.info('Using Backend AI provider (server-side proxy)');
  } else {
    logger.warn('AI features disabled (backend config or connectivity issue)');
  }

  // Initialize note generation service with aiProvider getter (avoids circular dependency)
  const noteGenerationService = new NoteGenerationService(() => container?.aiProvider ?? null);

  // Initialize callout service
  const calloutService = new CalloutService();

  // Initialize CRM services
  const hubSpotService = new HubSpotService();
  const salesforceService = new SalesforceService();

  // Initialize meeting notification service
  const meetingNotificationService = new MeetingNotificationService(calendarService);

  // Initialize prep service
  const prepService = new PrepService();

  // Initialize company info service
  const companyInfoService = new CompanyInfoService();

  // Inject CompanyInfoService into peopleRepo for automatic organization detection
  peopleRepo.setCompanyInfoService(companyInfoService);

  container = {
    meetingRepo,
    calloutRepo,
    settingsRepo,
    peopleRepo,
    branchRepo,
    aiProvider,
    calendarService,
    calloutService,
    noteGenerationService,
    hubSpotService,
    salesforceService,
    meetingNotificationService,
    prepService,
    companyInfoService,
    backendConfig,
  };

  logger.info('Container initialized');
  return container;
}

/**
 * Get the container instance
 * Throws if container hasn't been initialized
 */
export function getContainer(): AppContainer {
  if (!container) {
    throw new Error('Container not initialized. Call initializeContainer() first.');
  }
  return container;
}

/**
 * Refresh the backend configuration.
 * Can be called to re-fetch feature flags from the backend.
 */
export async function refreshBackendConfig(): Promise<BackendConfig | null> {
  if (!container) {
    throw new Error('Container not initialized');
  }

  try {
    const config = await getBackendAPI().fetchConfig();
    container.backendConfig = config;

    // Update AI provider based on new config
    if (config.features.ai && !container.aiProvider) {
      container.aiProvider = new BackendAIProvider();
      logger.info('AI provider enabled after config refresh');
    } else if (!config.features.ai && container.aiProvider) {
      container.aiProvider = null;
      logger.info('AI provider disabled after config refresh');
    }

    logger.info('Backend config refreshed', { features: config.features });
    return config;
  } catch (error) {
    logger.error('Failed to refresh backend config', error as Error);
    return null;
  }
}

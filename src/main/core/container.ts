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

export async function initializeContainer(): Promise<AppContainer> {
  const meetingRepo = new MeetingRepository();
  const calloutRepo = new CalloutRepository();
  const settingsRepo = new SettingsRepository();
  const peopleRepo = new PeopleRepository();
  const branchRepo = new BranchRepository();
  const calendarService = new CalendarService(settingsRepo);

  meetingRepo.setPeopleRepository(peopleRepo);
  meetingRepo.setPeopleApiFetcher((email: string) =>
    calendarService.fetchPersonNameFromGoogle(email)
  );

  settingsRepo.initializeDefaults();
  let settings = settingsRepo.getSettings();

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

  initializeBackendAPI();

  let backendConfig: BackendConfig | null = null;
  try {
    backendConfig = await getBackendAPI().fetchConfig();
    logger.info('Backend config fetched', { features: backendConfig.features });
  } catch (error) {
    logger.error('Failed to fetch backend config', error as Error);
  }

  let aiProvider: AIProvider | null = null;

  if (backendConfig?.features.ai) {
    aiProvider = new BackendAIProvider();
    logger.info('Using Backend AI provider (server-side proxy)');
  } else {
    logger.warn('AI features disabled (backend config or connectivity issue)');
  }

  const noteGenerationService = new NoteGenerationService(() => container?.aiProvider ?? null);
  const calloutService = new CalloutService();
  const hubSpotService = new HubSpotService();
  const salesforceService = new SalesforceService();
  const meetingNotificationService = new MeetingNotificationService(calendarService);
  const prepService = new PrepService();
  const companyInfoService = new CompanyInfoService();

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

export function getContainer(): AppContainer {
  if (!container) {
    throw new Error('Container not initialized. Call initializeContainer() first.');
  }
  return container;
}

export async function refreshBackendConfig(): Promise<BackendConfig | null> {
  if (!container) {
    throw new Error('Container not initialized');
  }

  try {
    const config = await getBackendAPI().fetchConfig();
    container.backendConfig = config;

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

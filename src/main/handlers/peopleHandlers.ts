import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';

const logger = createLogger('PeopleHandlers');

export function registerPeopleHandlers(): void {
  const { peopleRepo } = getContainer();

  // List all people
  ipcMain.handle(IPC_CHANNELS.PEOPLE_LIST, async () => {
    logger.debug('Listing all people');
    try {
      const people = peopleRepo.listAll();
      logger.info('Listed people', { count: people.length });
      return people;
    } catch (error) {
      logger.error('Failed to list people', { error: (error as Error).message });
      throw error;
    }
  });

  // Search people
  ipcMain.handle(IPC_CHANNELS.PEOPLE_SEARCH, async (_, query: string) => {
    logger.debug('Searching people', { query });
    try {
      const people = peopleRepo.search(query);
      logger.info('People search complete', { query, count: people.length });
      return people;
    } catch (error) {
      logger.error('Failed to search people', { error: (error as Error).message, query });
      throw error;
    }
  });

  // Get person by email
  ipcMain.handle(IPC_CHANNELS.PEOPLE_GET, async (_, email: string) => {
    logger.debug('Getting person by email', { email });
    try {
      const person = peopleRepo.getByEmail(email);
      if (!person) {
        logger.warn('Person not found', { email });
      }
      return person;
    } catch (error) {
      logger.error('Failed to get person', { error: (error as Error).message, email });
      throw error;
    }
  });

  // Update person notes
  ipcMain.handle(IPC_CHANNELS.PEOPLE_UPDATE_NOTES, async (_, email: string, notes: string) => {
    logger.debug('Updating person notes', { email });
    try {
      peopleRepo.updateNotes(email, notes);
      const person = peopleRepo.getByEmail(email);
      logger.info('Updated person notes', { email });
      return person;
    } catch (error) {
      logger.error('Failed to update person notes', { error: (error as Error).message, email });
      throw error;
    }
  });

  // Update person name
  ipcMain.handle(IPC_CHANNELS.PEOPLE_UPDATE_NAME, async (_, email: string, name: string) => {
    logger.debug('Updating person name', { email, name });
    try {
      peopleRepo.updateName(email, name);
      const person = peopleRepo.getByEmail(email);
      logger.info('Updated person name', { email, name });
      return person;
    } catch (error) {
      logger.error('Failed to update person name', { error: (error as Error).message, email });
      throw error;
    }
  });

  // Update person organization
  ipcMain.handle(IPC_CHANNELS.PEOPLE_UPDATE_ORGANIZATION, async (_, email: string, organization: string) => {
    logger.debug('Updating person organization', { email, organization });
    try {
      peopleRepo.updateOrganization(email, organization);
      const person = peopleRepo.getByEmail(email);
      logger.info('Updated person organization', { email, organization });
      return person;
    } catch (error) {
      logger.error('Failed to update person organization', { error: (error as Error).message, email });
      throw error;
    }
  });

  // Get people by meeting ID
  ipcMain.handle(IPC_CHANNELS.PEOPLE_GET_BY_MEETING, async (_, meetingId: string) => {
    logger.debug('Getting people for meeting', { meetingId });
    try {
      const people = peopleRepo.getByMeetingId(meetingId);
      logger.info('Retrieved people for meeting', { meetingId, count: people.length });
      return people;
    } catch (error) {
      logger.error('Failed to get people for meeting', { error: (error as Error).message, meetingId });
      throw error;
    }
  });

  // Get people stats
  ipcMain.handle(IPC_CHANNELS.PEOPLE_STATS, async () => {
    logger.debug('Getting people stats');
    try {
      const stats = peopleRepo.getStats();
      logger.info('Retrieved people stats', stats);
      return stats;
    } catch (error) {
      logger.error('Failed to get people stats', { error: (error as Error).message });
      throw error;
    }
  });

  // Get companies extracted from email domains
  ipcMain.handle(IPC_CHANNELS.PEOPLE_GET_COMPANIES, async () => {
    logger.debug('Getting companies');
    try {
      const companies = peopleRepo.getCompanies();
      logger.info('Retrieved companies', { count: companies.length });
      return companies;
    } catch (error) {
      logger.error('Failed to get companies', { error: (error as Error).message });
      throw error;
    }
  });

  // Sync contacts from calendar events (past and upcoming)
  ipcMain.handle(IPC_CHANNELS.PEOPLE_SYNC_FROM_CALENDAR, async () => {
    logger.info('Starting calendar contacts sync');
    const { calendarService, settingsRepo } = getContainer();

    try {
      // Fetch events from 6 months ago to 6 months in the future
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
      const sixMonthsFromNow = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);

      const events = await calendarService.fetchEventsInRange(sixMonthsAgo, sixMonthsFromNow);
      logger.info('Fetched calendar events for sync', { count: events.length });

      // Extract unique attendees from all events
      const attendeeMap = new Map<string, { email: string; name?: string }>();
      for (const event of events) {
        if (event.attendees) {
          for (const attendee of event.attendees) {
            if (attendee.email && !attendeeMap.has(attendee.email.toLowerCase())) {
              attendeeMap.set(attendee.email.toLowerCase(), {
                email: attendee.email.toLowerCase(),
                name: attendee.name,
              });
            }
          }
        }
      }

      const uniqueAttendees = Array.from(attendeeMap.values());
      logger.info('Found unique attendees', { count: uniqueAttendees.length });

      // Create People API fetcher for name resolution
      const peopleApiFetcher = (email: string) => calendarService.fetchPersonNameFromGoogle(email);

      // Upsert each attendee into the people database
      let synced = 0;
      for (const attendee of uniqueAttendees) {
        await peopleRepo.upsertFromCalendarAttendee(
          attendee.email,
          attendee.name,
          undefined,
          peopleApiFetcher
        );
        synced++;
      }

      // Store the last sync timestamp
      settingsRepo.updateSettings({ lastCalendarContactsSync: Date.now() });

      logger.info('Calendar contacts sync complete', { synced, total: uniqueAttendees.length });
      return { synced, total: uniqueAttendees.length };
    } catch (error) {
      logger.error('Failed to sync contacts from calendar', { error: (error as Error).message });
      throw error;
    }
  });

  // Cleanup names with numbers
  ipcMain.handle(IPC_CHANNELS.PEOPLE_CLEANUP_NAMES, async () => {
    logger.debug('Cleaning up names with numbers');
    try {
      const result = peopleRepo.cleanupNamesWithNumbers();
      logger.info('Name cleanup complete', result);
      return result;
    } catch (error) {
      logger.error('Failed to cleanup names', { error: (error as Error).message });
      throw error;
    }
  });

  // Populate missing organizations from email domains
  ipcMain.handle(IPC_CHANNELS.PEOPLE_POPULATE_ORGANIZATIONS, async () => {
    logger.info('Starting organization population');
    try {
      const result = await peopleRepo.populateMissingOrganizations();
      logger.info('Organization population complete', result);
      return result;
    } catch (error) {
      logger.error('Failed to populate organizations', { error: (error as Error).message });
      throw error;
    }
  });

  logger.info('People handlers registered');
}

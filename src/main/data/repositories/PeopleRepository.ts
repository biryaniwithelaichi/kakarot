import { Person } from '@shared/types';
import { getDatabase, saveDatabase } from '../database';
import { createLogger } from '../../core/logger';
import type { CompanyInfoService } from '../../services/CompanyInfoService';

const logger = createLogger('PeopleRepository');

// Common email domains to exclude from company extraction
const COMMON_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'mail.com',
  'live.com', 'msn.com', 'ymail.com', 'googlemail.com',
  'me.com', 'mac.com', 'inbox.com', 'zoho.com',
  'fastmail.com', 'tutanota.com', 'hey.com'
]);

export interface Company {
  name: string;
  domain: string;
  contactCount: number;
}

export class PeopleRepository {
  private companyInfoService: CompanyInfoService | null = null;

  /**
   * Set the CompanyInfoService for automatic organization detection
   */
  setCompanyInfoService(service: CompanyInfoService): void {
    this.companyInfoService = service;
  }

  listAll(): Person[] {
    const db = getDatabase();
    const rows = db.exec(
      'SELECT * FROM people ORDER BY last_meeting_at DESC'
    )[0]?.values || [];

    return rows.map(this.rowToPerson);
  }

  search(query: string): Person[] {
    const db = getDatabase();
    const searchPattern = `%${query.toLowerCase()}%`;
    const rows = db.exec(
      `SELECT * FROM people 
       WHERE LOWER(email) LIKE ? OR LOWER(name) LIKE ?
       ORDER BY meeting_count DESC, last_meeting_at DESC`,
      [searchPattern, searchPattern]
    )[0]?.values || [];

    return rows.map(this.rowToPerson);
  }

  getByEmail(email: string): Person | null {
    const db = getDatabase();
    const rows = db.exec(
      'SELECT * FROM people WHERE email = ?',
      [email]
    )[0]?.values || [];

    if (rows.length === 0) return null;
    return this.rowToPerson(rows[0]);
  }

  updateNotes(email: string, notes: string): void {
    const db = getDatabase();
    db.run(
      'UPDATE people SET notes = ? WHERE email = ?',
      [notes, email]
    );
    saveDatabase();
    logger.info('Updated person notes', { email });
  }

  updateName(email: string, name: string): void {
    const db = getDatabase();
    db.run(
      'UPDATE people SET name = ? WHERE email = ?',
      [name, email]
    );
    saveDatabase();
    logger.info('Updated person name', { email, name });
  }

  updateOrganization(email: string, organization: string): void {
    const db = getDatabase();
    db.run(
      'UPDATE people SET organization = ? WHERE email = ?',
      [organization, email]
    );
    saveDatabase();
    logger.info('Updated person organization', { email, organization });
  }

  getByMeetingId(meetingId: string): Person[] {
    const db = getDatabase();
    const meetingRows = db.exec(
      'SELECT attendee_emails FROM meetings WHERE id = ?',
      [meetingId]
    )[0]?.values || [];

    if (meetingRows.length === 0) return [];

    const attendeeEmails: string[] = JSON.parse(meetingRows[0][0] as string);
    if (attendeeEmails.length === 0) return [];

    const placeholders = attendeeEmails.map(() => '?').join(',');
    const rows = db.exec(
      `SELECT * FROM people WHERE email IN (${placeholders})`,
      attendeeEmails
    )[0]?.values || [];

    return rows.map(this.rowToPerson);
  }

  getStats(): {
    totalPeople: number;
    totalMeetings: number;
    avgMeetingsPerPerson: number;
  } {
    const db = getDatabase();
    const statsRows = db.exec(
      `SELECT 
        COUNT(*) as total_people,
        SUM(meeting_count) as total_meetings,
        AVG(meeting_count) as avg_meetings
       FROM people`
    )[0]?.values || [];

    if (statsRows.length === 0) {
      return { totalPeople: 0, totalMeetings: 0, avgMeetingsPerPerson: 0 };
    }

    const [totalPeople, totalMeetings, avgMeetings] = statsRows[0];
    return {
      totalPeople: totalPeople as number,
      totalMeetings: totalMeetings as number,
      avgMeetingsPerPerson: avgMeetings as number,
    };
  }

  // Resolves name from: calendarDisplayName -> People API -> email extraction
  // Resolves organization from: provided org -> email domain lookup
  async upsertFromCalendarAttendee(
    email: string,
    calendarDisplayName?: string,
    organization?: string,
    peopleApiFetcher?: (email: string) => Promise<string | null>
  ): Promise<void> {
    if (!email) return;

    const db = getDatabase();
    const now = Date.now();

    let name = calendarDisplayName;

    if (!name && peopleApiFetcher) {
      try {
        name = await peopleApiFetcher(email) || undefined;
      } catch (error) {
        logger.debug('People API lookup failed', { email, error: (error as Error).message });
      }
    }

    if (!name) {
      const localPart = email.split('@')[0];
      const nameParts = localPart
        .split(/[._-]/)
        .filter(part => part.length > 0)
        .map(part => part.replace(/\d+$/, '')) // Strip trailing numbers
        .filter(part => part.length > 0) // Remove parts that became empty
        .filter(part => !/^\d+$/.test(part)); // Remove purely numeric parts

      name = nameParts
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
      logger.debug('Using email-extracted name', { email, name });
    }

    // Auto-fetch organization from email domain if not provided
    let finalOrganization = organization;
    if (!finalOrganization && this.companyInfoService) {
      try {
        const companyInfo = await this.companyInfoService.fetchCompanyInfo(email);
        if (companyInfo?.name) {
          finalOrganization = companyInfo.name;
          logger.info('Auto-detected organization from email domain', { email, organization: finalOrganization });
        }
      } catch (error) {
        logger.debug('Organization auto-detection failed', { email, error: (error as Error).message });
      }
    }

    const existing = db.exec('SELECT * FROM people WHERE email = ?', [email]);

    if (existing[0]?.values.length > 0) {
      db.run(
        'UPDATE people SET name = COALESCE(name, ?), organization = COALESCE(organization, ?), updated_at = ? WHERE email = ?',
        [name, finalOrganization || null, now, email]
      );
      logger.info('Updated person from calendar', { email, name, source: calendarDisplayName ? 'calendar' : 'fallback' });
    } else {
      db.run(
        `INSERT INTO people (email, name, last_meeting_at, meeting_count, total_duration, organization, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [email, name, now, 0, 0, finalOrganization || null, now, now]
      );
      logger.info('Created person from calendar', { email, name, source: calendarDisplayName ? 'calendar' : 'fallback' });
    }

    saveDatabase();
  }

  getCompanies(): Company[] {
    const db = getDatabase();
    const rows = db.exec('SELECT email FROM people')[0]?.values || [];

    // Extract domains and count contacts per domain
    const domainCounts = new Map<string, number>();

    for (const row of rows) {
      const email = row[0] as string;
      const domain = email.split('@')[1]?.toLowerCase();

      if (!domain || COMMON_EMAIL_DOMAINS.has(domain)) {
        continue;
      }

      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    }

    // Convert to Company objects with formatted names
    const companies: Company[] = [];

    for (const [domain, count] of domainCounts) {
      // Extract company name from domain (e.g., "acme.com" -> "Acme")
      const domainParts = domain.split('.');
      const companyPart = domainParts[0];
      const name = companyPart.charAt(0).toUpperCase() + companyPart.slice(1);

      companies.push({
        name,
        domain,
        contactCount: count,
      });
    }

    // Sort by contact count descending
    return companies.sort((a, b) => b.contactCount - a.contactCount);
  }

  cleanupNamesWithNumbers(): { updated: number } {
    const db = getDatabase();
    const rows = db.exec('SELECT email, name FROM people')[0]?.values || [];
    let updated = 0;

    for (const row of rows) {
      const email = row[0] as string;
      const currentName = row[1] as string | null;

      if (!currentName) continue;

      // Check if name contains numbers
      if (!/\d/.test(currentName)) continue;

      // Extract clean name from email
      const localPart = email.split('@')[0];
      const nameParts = localPart
        .split(/[._-]/)
        .filter(part => part.length > 0)
        .map(part => part.replace(/\d+$/, '')) // Strip trailing numbers
        .filter(part => part.length > 0) // Remove parts that became empty
        .filter(part => !/^\d+$/.test(part)); // Remove purely numeric parts

      const cleanName = nameParts
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');

      if (cleanName && cleanName !== currentName) {
        db.run('UPDATE people SET name = ? WHERE email = ?', [cleanName, email]);
        updated++;
        logger.info('Cleaned up name with numbers', { email, old: currentName, new: cleanName });
      }
    }

    if (updated > 0) {
      saveDatabase();
    }

    return { updated };
  }

  /**
   * Populate missing organizations for all contacts by fetching from email domains
   * Returns the number of organizations updated
   */
  async populateMissingOrganizations(): Promise<{ updated: number; failed: number }> {
    if (!this.companyInfoService) {
      logger.warn('Cannot populate organizations: CompanyInfoService not available');
      return { updated: 0, failed: 0 };
    }

    const db = getDatabase();
    // Get all people without an organization
    const rows = db.exec(
      'SELECT email FROM people WHERE organization IS NULL OR organization = ""'
    )[0]?.values || [];

    let updated = 0;
    let failed = 0;

    logger.info('Starting organization population', { total: rows.length });

    for (const row of rows) {
      const email = row[0] as string;

      try {
        const companyInfo = await this.companyInfoService.fetchCompanyInfo(email);

        if (companyInfo?.name) {
          db.run('UPDATE people SET organization = ? WHERE email = ?', [companyInfo.name, email]);
          updated++;
          logger.info('Populated organization', { email, organization: companyInfo.name });
        } else {
          logger.debug('No organization found for email', { email });
        }
      } catch (error) {
        failed++;
        logger.debug('Failed to fetch organization', { email, error: (error as Error).message });
      }

      // Small delay to avoid overwhelming the network
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (updated > 0) {
      saveDatabase();
    }

    logger.info('Organization population complete', { updated, failed, total: rows.length });
    return { updated, failed };
  }

  private rowToPerson(row: unknown[]): Person {
    return {
      email: row[0] as string,
      name: (row[1] as string | null) ?? undefined,
      lastMeetingAt: row[2] ? new Date(row[2] as number) : new Date(0),
      meetingCount: row[3] as number,
      totalDuration: row[4] as number,
      notes: (row[5] as string | null) ?? undefined,
      organization: (row[6] as string | null) ?? undefined,
    };
  }
}

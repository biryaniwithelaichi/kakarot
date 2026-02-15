import { getDatabase, saveDatabase } from '../database';
import type { AppSettings, CustomMeetingType } from '@shared/types';
import { DEFAULT_SETTINGS } from '../../config/constants';
import { createLogger } from '../../core/logger';

const logger = createLogger('SettingsRepository');

export class SettingsRepository {
  initializeDefaults(): void {
    const db = getDatabase();
    const result = db.exec('SELECT COUNT(*) as count FROM settings');
    const count = result.length > 0 ? (result[0].values[0][0] as number) : 0;

    if (count === 0) {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
      }
      saveDatabase();
      logger.info('Initialized default settings');
    }
  }

  getSettings(): AppSettings {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM settings');
    if (result.length === 0) return DEFAULT_SETTINGS;

    const settings: Record<string, unknown> = {};
    for (let i = 0; i < result[0].values.length; i++) {
      const key = result[0].values[i][0] as string;
      const value = result[0].values[i][1] as string;
      settings[key] = JSON.parse(value);
    }

    const merged = { ...DEFAULT_SETTINGS, ...settings } as AppSettings;

    // API keys are now managed server-side via the Treeto backend.
    // No local API key loading is needed.

    // Migrate legacy customMeetingTypes (string[]) to customMeetingTypesV2 (CustomMeetingType[])
    if (merged.customMeetingTypes && merged.customMeetingTypes.length > 0 && !merged.customMeetingTypesMigrated) {
      const migrated: CustomMeetingType[] = merged.customMeetingTypes.map((name, idx) => ({
        id: `migrated-${Date.now()}-${idx}`,
        name,
        description: '',
        attendeeRoles: [],
        isExternal: false,
        objectives: [],
        customPrompt: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      // Save migrated types
      this.updateSettings({
        customMeetingTypesV2: migrated,
        customMeetingTypesMigrated: true,
      });

      merged.customMeetingTypesV2 = migrated;
      merged.customMeetingTypesMigrated = true;

      logger.info('Migrated legacy custom meeting types', { count: migrated.length });
    }

    return merged;
  }

  updateSettings(updates: Partial<AppSettings>): void {
    const db = getDatabase();
    for (const [key, value] of Object.entries(updates)) {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        key,
        JSON.stringify(value),
      ]);
    }
    saveDatabase();
    logger.info('Updated settings', { keys: Object.keys(updates) });
  }
}

import { safeStorage } from 'electron';
import { createLogger } from './logger';

const logger = createLogger('CredentialStore');

/**
 * Encrypts sensitive strings using Electron's safeStorage API.
 * Falls back to plaintext if safeStorage isn't available (e.g., Linux without a keyring).
 */

function isAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function encryptString(plaintext: string): string {
  if (!plaintext) return plaintext;
  if (!isAvailable()) {
    logger.warn('safeStorage unavailable, storing credential in plaintext');
    return plaintext;
  }
  try {
    const encrypted = safeStorage.encryptString(plaintext);
    // Prefix with 'enc:' so we can distinguish encrypted from plaintext on read
    return 'enc:' + encrypted.toString('base64');
  } catch (err) {
    logger.error('Failed to encrypt credential', err as Error);
    return plaintext;
  }
}

export function decryptString(stored: string): string {
  if (!stored) return stored;
  if (!stored.startsWith('enc:')) {
    // Not encrypted (legacy plaintext value or safeStorage was unavailable)
    return stored;
  }
  if (!isAvailable()) {
    logger.warn('safeStorage unavailable, cannot decrypt credential');
    return '';
  }
  try {
    const buffer = Buffer.from(stored.slice(4), 'base64');
    return safeStorage.decryptString(buffer);
  } catch (err) {
    logger.error('Failed to decrypt credential', err as Error);
    return '';
  }
}

/**
 * Keys in AppSettings that contain sensitive data and should be encrypted.
 */
export const SENSITIVE_SETTINGS_KEYS = new Set([
  'calendarConnections',
  'crmConnections',
  'icloudCalendarPassword',
  'googleCalendarClientSecret',
  'outlookCalendarClientSecret',
  'crmOAuthSalesforceClientSecret',
  'crmOAuthHubSpotClientSecret',
]);

/**
 * Recursively encrypts string values containing tokens/passwords within an object.
 * Targets fields named accessToken, refreshToken, appPassword, idToken.
 */
const TOKEN_FIELD_NAMES = new Set([
  'accessToken',
  'refreshToken',
  'appPassword',
  'idToken',
]);

export function encryptTokenFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(encryptTokenFields);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (TOKEN_FIELD_NAMES.has(key) && typeof value === 'string') {
        result[key] = encryptString(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = encryptTokenFields(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return obj;
}

export function decryptTokenFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(decryptTokenFields);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (TOKEN_FIELD_NAMES.has(key) && typeof value === 'string') {
        result[key] = decryptString(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = decryptTokenFields(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return obj;
}

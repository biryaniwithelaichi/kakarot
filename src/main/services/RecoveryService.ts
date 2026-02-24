import { app } from 'electron';
import { join } from 'path';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { createLogger } from '../core/logger';

const logger = createLogger('RecoveryService');

interface RecoveryState {
  meetingId: string;
  title: string;
  startedAt: number;
  lastSavedAt: number;
  segmentCount: number;
}

const RECOVERY_FILENAME = 'recording-recovery.json';

function getRecoveryPath(): string {
  return join(app.getPath('userData'), RECOVERY_FILENAME);
}

let saveTimer: NodeJS.Timeout | null = null;

/**
 * Mark that a recording is active. Called when recording starts.
 * On next app launch, if this file exists, we know a crash happened mid-recording.
 */
export function markRecordingActive(meetingId: string, title: string): void {
  const state: RecoveryState = {
    meetingId,
    title,
    startedAt: Date.now(),
    lastSavedAt: Date.now(),
    segmentCount: 0,
  };
  try {
    writeFileSync(getRecoveryPath(), JSON.stringify(state));
    logger.info('Recovery state saved', { meetingId });
  } catch (err) {
    logger.error('Failed to save recovery state', err as Error);
  }

  // Periodically update the recovery file so we know it's fresh
  if (saveTimer) clearInterval(saveTimer);
  saveTimer = setInterval(() => {
    updateRecoveryTimestamp();
  }, 30_000); // Every 30 seconds
}

function updateRecoveryTimestamp(): void {
  try {
    const path = getRecoveryPath();
    if (!existsSync(path)) return;
    const state: RecoveryState = JSON.parse(readFileSync(path, 'utf-8'));
    state.lastSavedAt = Date.now();
    writeFileSync(path, JSON.stringify(state));
  } catch {
    // Non-fatal
  }
}

/**
 * Clear the recovery state. Called when recording stops normally.
 */
export function clearRecoveryState(): void {
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
  try {
    const path = getRecoveryPath();
    if (existsSync(path)) {
      unlinkSync(path);
      logger.info('Recovery state cleared');
    }
  } catch (err) {
    logger.error('Failed to clear recovery state', err as Error);
  }
}

/**
 * Check if a previous recording was interrupted by a crash.
 * Returns the recovery state if found, null otherwise.
 */
export function checkForCrashRecovery(): RecoveryState | null {
  try {
    const path = getRecoveryPath();
    if (!existsSync(path)) return null;
    const state: RecoveryState = JSON.parse(readFileSync(path, 'utf-8'));
    logger.warn('Found crash recovery state', {
      meetingId: state.meetingId,
      title: state.title,
      crashedAt: new Date(state.lastSavedAt).toISOString(),
    });
    return state;
  } catch {
    return null;
  }
}

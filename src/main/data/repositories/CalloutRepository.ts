import { getDatabase, saveDatabase } from '../database';
import type { Callout } from '@shared/types';
import { createLogger } from '../../core/logger';

const logger = createLogger('CalloutRepository');

export class CalloutRepository {
  save(callout: Callout): void {
    const db = getDatabase();
    db.run(
      `INSERT INTO callouts
       (id, meeting_id, triggered_at, question, context, suggested_response, sources, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        callout.id,
        callout.meetingId,
        callout.triggeredAt.getTime(),
        callout.question,
        callout.context,
        callout.suggestedResponse,
        JSON.stringify(callout.sources),
        callout.dismissed ? 1 : 0,
      ]
    );
    saveDatabase();
    logger.debug('Saved callout', { id: callout.id, question: callout.question.slice(0, 50) });
  }

  dismiss(id: string): void {
    const db = getDatabase();
    db.run('UPDATE callouts SET dismissed = 1 WHERE id = ?', [id]);
    saveDatabase();
    logger.debug('Dismissed callout', { id });
  }
}

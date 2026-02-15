import { Branch } from '@shared/types';
import { getDatabase, saveDatabase } from '../database';
import { createLogger } from '../../core/logger';

const logger = createLogger('BranchRepository');

export class BranchRepository {
  listAll(): Branch[] {
    const db = getDatabase();
    const rows = db.exec(
      'SELECT * FROM branches ORDER BY created_at ASC'
    )[0]?.values || [];

    return rows.map(this.rowToBranch);
  }

  getById(id: string): Branch | null {
    const db = getDatabase();
    const rows = db.exec(
      'SELECT * FROM branches WHERE id = ?',
      [id]
    )[0]?.values || [];

    if (rows.length === 0) return null;
    return this.rowToBranch(rows[0]);
  }

  create(branch: Omit<Branch, 'createdAt' | 'updatedAt'>): Branch {
    const db = getDatabase();
    const now = Date.now();

    db.run(
      `INSERT INTO branches (id, name, description, explanation, prompt, thumbnail_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        branch.id,
        branch.name,
        branch.description,
        branch.explanation,
        branch.prompt,
        branch.thumbnailUrl || null,
        now,
        now
      ]
    );

    saveDatabase();
    logger.info('Created branch', { id: branch.id, name: branch.name });

    return {
      ...branch,
      createdAt: new Date(now),
      updatedAt: new Date(now)
    };
  }

  update(id: string, updates: Partial<Omit<Branch, 'id' | 'createdAt' | 'updatedAt'>>): Branch | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const db = getDatabase();
    const now = Date.now();

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.explanation !== undefined) {
      fields.push('explanation = ?');
      values.push(updates.explanation);
    }
    if (updates.prompt !== undefined) {
      fields.push('prompt = ?');
      values.push(updates.prompt);
    }
    if (updates.thumbnailUrl !== undefined) {
      fields.push('thumbnail_url = ?');
      values.push(updates.thumbnailUrl);
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    db.run(
      `UPDATE branches SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    saveDatabase();
    logger.info('Updated branch', { id, updates });

    return this.getById(id);
  }

  delete(id: string): boolean {
    const db = getDatabase();
    const existing = this.getById(id);

    if (!existing) return false;

    db.run('DELETE FROM branches WHERE id = ?', [id]);
    saveDatabase();
    logger.info('Deleted branch', { id });

    return true;
  }

  private rowToBranch(row: any[]): Branch {
    return {
      id: row[0] as string,
      name: row[1] as string,
      description: row[2] as string,
      explanation: row[3] as string,
      prompt: row[4] as string,
      thumbnailUrl: row[5] as string | undefined,
      createdAt: new Date(row[6] as number),
      updatedAt: new Date(row[7] as number)
    };
  }
}

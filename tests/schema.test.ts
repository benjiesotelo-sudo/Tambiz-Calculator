// The schema runs on every cold start, so it must apply cleanly over and over, and the sample data must still load.
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA } from '@/lib/schema';
import { seedIfEmpty } from '@/lib/seed';
import type { Row, Statement } from '@/lib/db';

describe('schema', () => {
  it('applies twice without error, and the sample event loads on top of it', async () => {
    const pg = new PGlite();
    const db = {
      query: async (text: string, params: unknown[] = []) => (await pg.query<Row>(text, params)).rows,
      transaction: async (statements: Statement[]) => {
        await pg.transaction(async (tx) => {
          for (const s of statements) await tx.query(s.text, s.params ?? []);
        });
      },
    };
    await db.transaction(SCHEMA.map((text) => ({ text })));
    await db.transaction(SCHEMA.map((text) => ({ text })));
    await seedIfEmpty(db);
    const [row] = await db.query('SELECT (SELECT count(*)::int FROM event) AS events, (SELECT count(*)::int FROM access_link) AS links');
    expect(row).toEqual({ events: 1, links: 0 });

    // Groups are known by name alone (15 September 2026): the sample groups have no code, a group needs none, and a
    // code already stored by an earlier version survives the schema running again.
    const [event] = await db.query('SELECT id FROM event');
    expect(await db.query('SELECT count(*)::int AS n FROM tgroup WHERE code IS NOT NULL')).toEqual([{ n: 0 }]);
    await db.query(`INSERT INTO tgroup (id, event_id, code, name, name_key) VALUES ('old', $1, 'G01', 'Old Venture', 'OLDVENTURE')`, [event.id]);
    await db.query(`INSERT INTO tgroup (id, event_id, code, name, name_key) VALUES ('old2', $1, 'G01', 'Older Venture', 'OLDERVENTURE')`, [event.id]);
    await db.transaction(SCHEMA.map((text) => ({ text })));
    expect(await db.query(`SELECT code FROM tgroup WHERE id IN ('old', 'old2')`)).toEqual([{ code: 'G01' }, { code: 'G01' }]);
    // The name is still unique within the event, ignoring spacing, punctuation and capitals.
    await expect(db.query(`INSERT INTO tgroup (id, event_id, name, name_key) VALUES ('twin', $1, 'old venture!', 'OLDVENTURE')`, [event.id])).rejects.toThrow();
    await pg.close();
  });
});

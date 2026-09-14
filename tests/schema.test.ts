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
    await pg.close();
  });
});

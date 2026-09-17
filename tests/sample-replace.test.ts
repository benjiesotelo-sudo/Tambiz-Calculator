// An older version's sample event is replaced only when the coordinator presses the button, and never an event they created.
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA } from '@/lib/schema';
import { PRACTICE_TITLE, replaceSampleEvent, sampleEventSize, seedIfEmpty } from '@/lib/seed';
import { DEFAULT_RUBRIC } from '@/lib/rubric';
import type { Row, Statement } from '@/lib/db';

async function freshDb() {
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
  return db;
}
type Db = Awaited<ReturnType<typeof freshDb>>;

/** An event with one scored group, as the old seed (evt- id, not practice) or the app (a UUID) would have made it. */
async function eventWithScores(db: Db, eventId: string, title: string, judgeId: string) {
  await db.transaction([
    { text: `INSERT INTO event (id, year, title, status, rubric) VALUES ($1, 2027, $2, 'judging', $3::jsonb)`, params: [eventId, title, JSON.stringify(DEFAULT_RUBRIC)] },
    { text: 'INSERT INTO student (id, event_id, student_number, email, surname, first_name, middle_name, section) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', params: [`${eventId}-s`, eventId, `N${eventId}`, 'a@b.test', 'Reyes', 'Ana', '', 'BA-3A'] },
    { text: 'INSERT INTO tgroup (id, event_id, name, name_key) VALUES ($1, $2, $3, $4)', params: [`${eventId}-g`, eventId, 'OLD GROUP', 'OLDGROUP'] },
    { text: 'INSERT INTO group_member (event_id, group_id, student_id) VALUES ($1, $2, $3)', params: [eventId, `${eventId}-g`, `${eventId}-s`] },
    { text: `INSERT INTO score_sheet (id, event_id, group_id, half, judge_id, status) VALUES ($1, $2, $3, 'defense', $4, 'complete')`, params: [`${eventId}-sh`, eventId, `${eventId}-g`, judgeId] },
    { text: 'INSERT INTO score_value (sheet_id, criterion_key, value) VALUES ($1, $2, 7)', params: [`${eventId}-sh`, 'k1'] },
  ]);
}

const hashes = async (db: Db) => db.query('SELECT id, email, password_hash FROM account ORDER BY id');
const scoresOf = async (db: Db, eventId: string) => db.query('SELECT v.* FROM score_value v JOIN score_sheet s ON s.id = v.sheet_id WHERE s.event_id = $1 ORDER BY v.sheet_id, v.criterion_key', [eventId]);

describe('replacing an older sample event with the practice event', () => {
  it('replaces an old seed event and only its scores; an event the coordinator created is refused and untouched; no password changes', async () => {
    const db = await freshDb();
    await seedIfEmpty(db);
    const judge = String((await db.query(`SELECT id FROM account WHERE email = 'judge1@tambiz.demo'`))[0].id);
    const practice = String((await db.query('SELECT id FROM event WHERE practice')).at(0)!.id);
    await eventWithScores(db, 'evt-old-1', 'Tambiz 2027', judge);
    await eventWithScores(db, '6f1c2b1e-8d4a-4a53-9a55-3f0e1a2b3c4d', 'Tambiz 2028', judge);
    const accounts = await hashes(db);
    const keptPractice = await scoresOf(db, practice);
    const keptReal = await scoresOf(db, '6f1c2b1e-8d4a-4a53-9a55-3f0e1a2b3c4d');

    expect(await sampleEventSize(db, 'evt-old-1')).toEqual({ id: 'evt-old-1', title: 'Tambiz 2027', students: 1, groups: 1, sheets: 1 });

    const refused = await replaceSampleEvent(db, '6f1c2b1e-8d4a-4a53-9a55-3f0e1a2b3c4d', 'coordinator');
    expect(refused.ok).toBe(false);
    expect(await db.query('SELECT title FROM event WHERE id = $1', ['6f1c2b1e-8d4a-4a53-9a55-3f0e1a2b3c4d'])).toEqual([{ title: 'Tambiz 2028' }]);
    expect(await scoresOf(db, '6f1c2b1e-8d4a-4a53-9a55-3f0e1a2b3c4d')).toEqual(keptReal);

    const done = await replaceSampleEvent(db, 'evt-old-1', 'coordinator');
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(await db.query('SELECT id FROM event WHERE id = $1', ['evt-old-1'])).toEqual([]);
    expect(await db.query('SELECT count(*)::int AS n FROM score_sheet WHERE event_id = $1', ['evt-old-1'])).toEqual([{ n: 0 }]);
    const fresh = (await db.query('SELECT id, title, practice FROM event WHERE id = $1', [done.eventId]))[0];
    expect(fresh).toMatchObject({ title: PRACTICE_TITLE, practice: true });
    expect(String(fresh.id)).toMatch(/^evt-/);
    expect((await db.query('SELECT name FROM tgroup WHERE event_id = $1', [done.eventId])).map((g) => g.name)).toEqual(expect.arrayContaining(['PAYONG PALAY', 'PINILI']));
    expect((await scoresOf(db, done.eventId)).length).toBeGreaterThan(0);
    expect(await db.query('SELECT a.email FROM event_judge j JOIN account a ON a.id = j.account_id WHERE j.event_id = $1 ORDER BY a.email', [done.eventId])).toEqual([
      { email: 'judge1@tambiz.demo' },
      { email: 'judge2@tambiz.demo' },
      { email: 'judge3@tambiz.demo' },
    ]);

    expect(await scoresOf(db, practice)).toEqual(keptPractice);
    expect(await scoresOf(db, '6f1c2b1e-8d4a-4a53-9a55-3f0e1a2b3c4d')).toEqual(keptReal);
    expect(await hashes(db)).toEqual(accounts);
    expect(await db.query(`SELECT event_id, account_id, detail->'removed'->>'title' AS title FROM change_log WHERE action = 'event.replace-sample'`)).toEqual([
      { event_id: done.eventId, account_id: 'coordinator', title: 'Tambiz 2027' },
    ]);
  });

  it('creates a missing sample judge account and leaves every existing account as it was', async () => {
    const db = await freshDb();
    await db.query(`INSERT INTO account (id, email, display_name, role, password_hash) VALUES ('acc-a', 'admin@tambiz.demo', 'Coordinator', 'admin', 'h-admin'), ('acc-j', 'judge2@tambiz.demo', 'Judge', 'judge', 'h-judge')`);
    await eventWithScores(db, 'evt-old-2', 'Tambiz 2027', 'acc-j');
    const done = await replaceSampleEvent(db, 'evt-old-2', 'acc-a');
    expect(done.ok).toBe(true);
    const accounts = await db.query('SELECT id, email, password_hash FROM account ORDER BY email');
    expect(accounts.map((a) => a.email)).toEqual(['admin@tambiz.demo', 'judge1@tambiz.demo', 'judge2@tambiz.demo', 'judge3@tambiz.demo']);
    expect(accounts.find((a) => a.email === 'admin@tambiz.demo')).toMatchObject({ id: 'acc-a', password_hash: 'h-admin' });
    expect(accounts.find((a) => a.email === 'judge2@tambiz.demo')).toMatchObject({ id: 'acc-j', password_hash: 'h-judge' });
  });
});

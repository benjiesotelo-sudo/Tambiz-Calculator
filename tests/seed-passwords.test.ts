// Changing SEED_ADMIN_PASSWORD or SEED_JUDGE_PASSWORD and redeploying must change the stored password,
// even though the database was seeded earlier with a different one.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA } from '@/lib/schema';
import { DEMO_PASSWORD, seedIfEmpty, syncSeedPasswords } from '@/lib/seed';
import { verifyPassword } from '@/lib/passwords';
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

const hashOf = async (db: Awaited<ReturnType<typeof freshDb>>, email: string) =>
  String((await db.query('SELECT password_hash FROM account WHERE email = $1', [email]))[0].password_hash);

describe('seed passwords follow the environment variables', () => {
  const saved = { admin: process.env.SEED_ADMIN_PASSWORD, judge: process.env.SEED_JUDGE_PASSWORD };
  beforeEach(() => {
    delete process.env.SEED_ADMIN_PASSWORD;
    delete process.env.SEED_JUDGE_PASSWORD;
  });
  afterEach(() => {
    process.env.SEED_ADMIN_PASSWORD = saved.admin;
    process.env.SEED_JUDGE_PASSWORD = saved.judge;
    if (saved.admin === undefined) delete process.env.SEED_ADMIN_PASSWORD;
    if (saved.judge === undefined) delete process.env.SEED_JUDGE_PASSWORD;
  });

  it('updates passwords seeded earlier with the demo password, signs those accounts out, and is idempotent', async () => {
    const db = await freshDb();
    await seedIfEmpty(db);
    expect(await verifyPassword(DEMO_PASSWORD, await hashOf(db, 'admin@tambiz.demo'))).toBe(true);
    expect(await syncSeedPasswords(db)).toEqual([]);

    const admin = (await db.query(`SELECT id FROM account WHERE email = 'admin@tambiz.demo'`))[0].id;
    await db.query(`INSERT INTO session (token_hash, account_id, expires_at) VALUES ('t1', $1, now() + interval '1 day')`, [admin]);
    await db.query(`UPDATE account SET failed_logins = 5, locked_until = now() + interval '5 minutes' WHERE id = $1`, [admin]);

    process.env.SEED_ADMIN_PASSWORD = 'TambizAdmin2027!';
    process.env.SEED_JUDGE_PASSWORD = 'TambizJudge2027';
    expect((await syncSeedPasswords(db)).sort()).toEqual(['admin@tambiz.demo', 'judge1@tambiz.demo', 'judge2@tambiz.demo', 'judge3@tambiz.demo']);

    expect(await verifyPassword('TambizAdmin2027!', await hashOf(db, 'admin@tambiz.demo'))).toBe(true);
    expect(await verifyPassword(DEMO_PASSWORD, await hashOf(db, 'admin@tambiz.demo'))).toBe(false);
    for (const j of ['judge1', 'judge2', 'judge3']) expect(await verifyPassword('TambizJudge2027', await hashOf(db, `${j}@tambiz.demo`))).toBe(true);
    const acc = (await db.query('SELECT failed_logins, locked_until FROM account WHERE id = $1', [admin]))[0];
    expect(acc.failed_logins).toBe(0);
    expect(acc.locked_until).toBeNull();
    expect(await db.query('SELECT 1 FROM session WHERE account_id = $1', [admin])).toHaveLength(0);

    // A second start with the same variables changes nothing.
    expect(await syncSeedPasswords(db)).toEqual([]);
  });

  it('only touches the half whose variable is set, and never accounts created in the app', async () => {
    const db = await freshDb();
    await seedIfEmpty(db);
    await db.query(`INSERT INTO account (id, email, display_name, role, password_hash) VALUES ('x', 'real.judge@feu.edu.ph', 'Real', 'judge', 'scrypt$1$1$1$AA==$AA==')`);
    process.env.SEED_ADMIN_PASSWORD = 'another-long-admin-password';
    expect(await syncSeedPasswords(db)).toEqual(['admin@tambiz.demo']);
    expect(await verifyPassword(DEMO_PASSWORD, await hashOf(db, 'judge1@tambiz.demo'))).toBe(true);
    expect(await hashOf(db, 'real.judge@feu.edu.ph')).toBe('scrypt$1$1$1$AA==$AA==');
  });
});

// The only module that talks to a database.
// DATABASE_URL set  → Neon Postgres over HTTP (production on Vercel).
// DATABASE_URL unset → PGlite, a real Postgres compiled to WebAssembly, stored in .local-db/ (or in memory on Vercel),
//                      so the app runs and can be demonstrated with no database account at all.
// Both speak the same SQL, so nothing else in the app knows which one is in use.

import { SCHEMA } from './schema';

export type Row = Record<string, unknown>;
export type Statement = { text: string; params?: unknown[] };

interface Driver {
  query(text: string, params?: unknown[]): Promise<Row[]>;
  /** Runs every statement in one transaction; all succeed or none do. */
  transaction(statements: Statement[]): Promise<void>;
  kind: 'neon' | 'pglite';
}

async function neonDriver(url: string): Promise<Driver> {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  return {
    kind: 'neon',
    query: async (text, params = []) => (await sql.query(text, params)) as Row[],
    transaction: async (statements) => {
      if (!statements.length) return;
      await sql.transaction(statements.map((s) => sql.query(s.text, s.params ?? [])));
    },
  };
}

async function pgliteDriver(): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.VERCEL ? undefined : process.env.PGLITE_DIR || './.local-db';
  const db = dir ? new PGlite(dir) : new PGlite();
  await db.waitReady;
  return {
    kind: 'pglite',
    query: async (text, params = []) => (await db.query<Row>(text, params)).rows,
    transaction: async (statements) => {
      await db.transaction(async (tx) => {
        for (const s of statements) await tx.query(s.text, s.params ?? []);
      });
    },
  };
}

type Ready = { driver: Driver };
const g = globalThis as unknown as { __tambizDb?: Promise<Ready> };

async function init(): Promise<Ready> {
  const url = process.env.DATABASE_URL;
  const driver = url ? await neonDriver(url) : await pgliteDriver();
  await driver.transaction(SCHEMA.map((text) => ({ text })));
  const { seedIfEmpty } = await import('./seed');
  await seedIfEmpty({ query: driver.query, transaction: driver.transaction });
  return { driver };
}

function ready() {
  if (!g.__tambizDb) {
    g.__tambizDb = init().catch((e) => {
      g.__tambizDb = undefined;
      throw e;
    });
  }
  return g.__tambizDb;
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const { driver } = await ready();
  return (await driver.query(text, params)) as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

export async function transaction(statements: Statement[]) {
  const { driver } = await ready();
  await driver.transaction(statements);
}

export async function databaseKind() {
  return (await ready()).driver.kind;
}

export const newId = () => crypto.randomUUID();

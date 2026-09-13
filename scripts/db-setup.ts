// Creates or updates the database tables, and adds the sample event and demo accounts if the database is empty.
// Usage: DATABASE_URL="postgres://..." npm run db:setup     (without DATABASE_URL it sets up the local .local-db/)
import { databaseKind, query } from '../src/lib/db';

async function main() {
  const kind = await databaseKind();
  const [{ accounts, events }] = await query<{ accounts: number; events: number }>(
    'SELECT (SELECT count(*)::int FROM account) AS accounts, (SELECT count(*)::int FROM event) AS events',
  );
  console.log(`Database ready (${kind === 'neon' ? 'Postgres from DATABASE_URL' : 'local PGlite in .local-db/'}): ${accounts} accounts, ${events} events.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Emergency password reset for any account, including the coordinator's own.
// Usage: DATABASE_URL="postgres://..." npm run reset-password -- admin@example.com "a new long password"
import { query } from '../src/lib/db';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/lib/passwords';

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) throw new Error('Usage: npm run reset-password -- <email> "<new password>"');
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  const rows = await query<{ id: string }>('UPDATE account SET password_hash = $2, failed_logins = 0, locked_until = NULL, disabled_at = NULL WHERE lower(email) = lower($1) RETURNING id', [
    email,
    await hashPassword(password),
  ]);
  if (!rows.length) throw new Error(`No account with the login ${email}.`);
  await query('DELETE FROM session WHERE account_id = $1', [rows[0].id]);
  console.log(`Password reset for ${email}. Every session for that account was signed out.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

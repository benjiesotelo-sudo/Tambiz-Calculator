// Sign-in and sessions. Every page and every server action calls requireAdmin() or requireJudge() itself,
// rather than relying on middleware (the lesson of CVE-2025-29927).

import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';
import { one, query } from './db';
import { sha256, verifyPassword } from './passwords';

export const SESSION_COOKIE = 'tambiz_session';
const SESSION_DAYS = 7;

export interface Account {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'judge';
}

export async function signIn(email: string, password: string): Promise<{ ok: true; account: Account } | { ok: false; message: string }> {
  const generic = 'Sign-in failed. Check your email and password.';
  const acc = await one<Account & { password_hash: string; failed_logins: number; locked_until: Date | null; disabled_at: Date | null }>(
    'SELECT * FROM account WHERE lower(email) = lower($1)',
    [email.trim()],
  );
  if (!acc || acc.disabled_at) {
    // Spend comparable time so a missing account is not revealed by speed.
    await verifyPassword(password, 'scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    return { ok: false, message: generic };
  }
  if (acc.locked_until && new Date(acc.locked_until) > new Date()) {
    const secs = Math.ceil((new Date(acc.locked_until).getTime() - Date.now()) / 1000);
    return { ok: false, message: `Too many attempts. Wait ${secs} seconds, then try again.` };
  }
  if (!(await verifyPassword(password, acc.password_hash))) {
    const fails = acc.failed_logins + 1;
    // After 3 failures the wait doubles each time, up to 5 minutes.
    const waitSecs = fails >= 3 ? Math.min(300, 2 ** (fails - 2) * 5) : 0;
    await query(`UPDATE account SET failed_logins = $2, locked_until = CASE WHEN $3::int > 0 THEN now() + ($3::int * interval '1 second') ELSE NULL END WHERE id = $1`, [acc.id, fails, waitSecs]);
    return { ok: false, message: generic };
  }
  await query('UPDATE account SET failed_logins = 0, locked_until = NULL WHERE id = $1', [acc.id]);
  const token = randomBytes(32).toString('base64url');
  await query(`INSERT INTO session (token_hash, account_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha256(token), acc.id]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  return { ok: true, account: { id: acc.id, email: acc.email, display_name: acc.display_name, role: acc.role } };
}

export async function currentAccount(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<Account>(
    `SELECT a.id, a.email, a.display_name, a.role FROM session s JOIN account a ON a.id = s.account_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND a.disabled_at IS NULL`,
    [sha256(token)],
  );
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query('DELETE FROM session WHERE token_hash = $1', [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function requireAccount(): Promise<Account> {
  const acc = await currentAccount();
  if (!acc) redirect('/login');
  return acc;
}

export async function requireAdmin(): Promise<Account> {
  const acc = await requireAccount();
  if (acc.role !== 'admin') redirect('/');
  return acc;
}

export async function requireJudge(): Promise<Account> {
  const acc = await requireAccount();
  if (acc.role !== 'judge') redirect('/');
  return acc;
}

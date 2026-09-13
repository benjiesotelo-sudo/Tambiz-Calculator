// Students' and advisers' private links (decision 8): issuing, opening, and the short session a correct check opens.
// Only a fingerprint (SHA-256) of each link's code is stored, so the database alone holds no working links.
// The rules themselves are in link-rules.ts.

import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { newId, one, query, transaction, type Statement } from './db';
import { checkMatches, emailGivesAway, LINK_DAYS, linkState, MAX_TRIES, SESSION_MINUTES, type LinkState } from './link-rules';
import { sha256 } from './passwords';

export type RecipientType = 'student' | 'adviser';

export interface LinkRow {
  id: string;
  event_id: string;
  recipient_type: RecipientType;
  recipient_id: string;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  failed_attempts: number;
  locked_at: Date | null;
  first_opened_at: Date | null;
  last_opened_at: Date | null;
  open_count: number;
}

export interface Recipient {
  type: RecipientType;
  id: string;
  name: string;
  email: string;
}

const COOKIE = 'tambiz_link';
export const CODE_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

/**
 * The fixed address links are built from, never the address a request arrived on.
 * APP_URL when set; otherwise Vercel's production address, a preview's own address, or localhost.
 */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const configured = env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return `http://localhost:${env.PORT ?? 3000}`;
}

export const linkUrl = (code: string) => `${appBaseUrl()}/r/${code}`;

/** Everyone who gets a link at release: every group member with an email, and every adviser of a group with an email and a code. */
export async function releaseRecipients(eventId: string) {
  const [students, advisers] = await Promise.all([
    query<{ id: string; first_name: string; surname: string; email: string; student_number: string }>(
      `SELECT s.id, s.first_name, s.surname, s.email, s.student_number FROM group_member m JOIN student s ON s.id = m.student_id
       WHERE m.event_id = $1 ORDER BY s.surname, s.first_name`,
      [eventId],
    ),
    query<{ id: string; name: string; email: string; link_code: string }>(
      `SELECT a.id, a.name, a.email, a.link_code FROM adviser a WHERE a.event_id = $1 AND EXISTS (SELECT 1 FROM tgroup g WHERE g.adviser_id = a.id) ORDER BY a.name`,
      [eventId],
    ),
  ]);
  const recipients: Recipient[] = [];
  const problems: string[] = [];
  for (const s of students) {
    const name = `${s.first_name} ${s.surname}`;
    if (!s.email.trim()) problems.push(`${name} has no email on the class roll, so gets no link.`);
    else {
      recipients.push({ type: 'student', id: s.id, name, email: s.email.trim() });
      if (emailGivesAway(s.email, s.student_number)) problems.push(`${name}’s email contains their student number, so anyone with the email can open the link.`);
    }
  }
  for (const a of advisers) {
    if (!a.email.trim()) problems.push(`${a.name} has no email, so gets no link.`);
    else if (!a.link_code.trim()) problems.push(`${a.name} has no adviser code yet, so gets no link. Set one on the Advisers tab.`);
    else {
      recipients.push({ type: 'adviser', id: a.id, name: a.name, email: a.email.trim() });
      if (emailGivesAway(a.email, a.link_code)) problems.push(`${a.name}’s email contains their adviser code. Choose a different code.`);
    }
  }
  return { recipients, problems };
}

/**
 * A fresh link for each recipient, open for 30 days. Any earlier link of theirs stops working.
 * Returns the codes; they exist only in this response, so the caller must put them in the mailing sheet.
 */
export async function issueLinks(eventId: string, recipients: Recipient[]): Promise<{ recipient: Recipient; code: string }[]> {
  const issued = recipients.map((recipient) => ({ recipient, code: randomBytes(32).toString('base64url') }));
  if (!issued.length) return issued;
  const statements: Statement[] = [
    {
      text: `UPDATE access_link SET revoked_at = now() WHERE event_id = $1 AND revoked_at IS NULL AND (recipient_type || ':' || recipient_id) = ANY($2::text[])`,
      params: [eventId, recipients.map((r) => `${r.type}:${r.id}`)],
    },
  ];
  for (let i = 0; i < issued.length; i += 100) {
    const params: unknown[] = [];
    const tuples = issued.slice(i, i + 100).map(({ recipient, code }) => {
      const vals = [newId(), eventId, recipient.type, recipient.id, sha256(code)];
      return `(${vals.map((v) => (params.push(v), `$${params.length}`)).join(', ')}, now() + interval '${LINK_DAYS} days')`;
    });
    statements.push({ text: `INSERT INTO access_link (id, event_id, recipient_type, recipient_id, code_hash, expires_at) VALUES ${tuples.join(', ')}`, params });
  }
  await transaction(statements);
  return issued;
}

export async function findLink(code: string): Promise<LinkRow | null> {
  if (!CODE_PATTERN.test(code)) return null;
  return one<LinkRow>('SELECT * FROM access_link WHERE code_hash = $1', [sha256(code)]);
}

/** True when this browser typed the right check for this link in the last 30 minutes. */
export async function hasLinkSession(link: LinkRow): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  return !!(await one('SELECT 1 AS ok FROM link_session WHERE token_hash = $1 AND link_id = $2 AND expires_at > now()', [sha256(token), link.id]));
}

async function checkValueFor(link: LinkRow): Promise<string | null> {
  const row =
    link.recipient_type === 'student'
      ? await one<{ v: string }>('SELECT student_number AS v FROM student WHERE id = $1 AND event_id = $2', [link.recipient_id, link.event_id])
      : await one<{ v: string }>('SELECT link_code AS v FROM adviser WHERE id = $1 AND event_id = $2', [link.recipient_id, link.event_id]);
  return row?.v?.trim() ? row.v : null;
}

export type OpenResult = { ok: true } | { ok: false; state: LinkState | 'missing' } | { ok: false; state: 'wrong'; triesLeft: number };

/** Checks what the holder typed. Right: a 30-minute session for this link only. Wrong: one of five tries used. */
export async function openLink(code: string, typed: string): Promise<OpenResult> {
  const link = await findLink(code);
  if (!link) return { ok: false, state: 'missing' };
  const state = linkState(link);
  if (state !== 'ok') return { ok: false, state };
  const expected = await checkValueFor(link);
  if (expected && checkMatches(typed, expected)) {
    const token = randomBytes(32).toString('base64url');
    await transaction([
      { text: 'DELETE FROM link_session WHERE expires_at < now()' },
      { text: `INSERT INTO link_session (token_hash, link_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_MINUTES} minutes')`, params: [sha256(token), link.id] },
      {
        text: 'UPDATE access_link SET failed_attempts = 0, first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now(), open_count = open_count + 1 WHERE id = $1',
        params: [link.id],
      },
    ]);
    (await cookies()).set(COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: `/r/${code}`,
      maxAge: SESSION_MINUTES * 60,
    });
    return { ok: true };
  }
  const r = await one<{ failed_attempts: number; locked: boolean }>(
    `UPDATE access_link SET failed_attempts = failed_attempts + 1, locked_at = CASE WHEN failed_attempts + 1 >= $2 THEN now() ELSE NULL END
     WHERE id = $1 AND locked_at IS NULL RETURNING failed_attempts, locked_at IS NOT NULL AS locked`,
    [link.id, MAX_TRIES],
  );
  if (!r || r.locked) return { ok: false, state: 'locked' };
  return { ok: false, state: 'wrong', triesLeft: MAX_TRIES - r.failed_attempts };
}

export async function closeLinkSession(code: string) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await query('DELETE FROM link_session WHERE token_hash = $1', [sha256(token)]);
  jar.set(COOKIE, '', { path: `/r/${code}`, maxAge: 0 });
}

/** Every link still in use for an event, with whose it is, for the Release tab. */
export async function linkStatus(eventId: string) {
  return query<LinkRow & { name: string; email: string }>(
    `SELECT l.*, coalesce(s.first_name || ' ' || s.surname, a.name, '') AS name, coalesce(s.email, a.email, '') AS email
     FROM access_link l
     LEFT JOIN student s ON l.recipient_type = 'student' AND s.id = l.recipient_id
     LEFT JOIN adviser a ON l.recipient_type = 'adviser' AND a.id = l.recipient_id
     WHERE l.event_id = $1 AND l.revoked_at IS NULL
     ORDER BY l.recipient_type DESC, name`,
    [eventId],
  );
}

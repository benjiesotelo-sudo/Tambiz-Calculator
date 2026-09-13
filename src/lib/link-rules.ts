// Rules for students' and advisers' private links (decision 8). Pure, so they can be tested without a database.
//
// A link is a long random code. Opening it shows nothing until the holder types a check value that is not in the email:
// a student types their student number; an adviser types the short code the coordinator handed out.
// Five wrong tries lock the link. Opening it never uses it up, so an email scanner visiting first does no harm.
// A link stays open for 30 days from when it was issued at release, or reissued, and can be opened any number of times.

import { randomInt } from 'node:crypto';

export const MAX_TRIES = 5;
export const LINK_DAYS = 30;
export const SESSION_MINUTES = 30;

/** Spaces, dashes and letter case are ignored when comparing what was typed with what is on record. */
export const normaliseCheck = (v: string) => v.replace(/[^0-9a-z]/gi, '').toUpperCase();

export function checkMatches(typed: string, onRecord: string): boolean {
  const a = normaliseCheck(typed);
  return a.length > 0 && a === normaliseCheck(onRecord);
}

export type LinkState = 'ok' | 'revoked' | 'locked' | 'expired';

export function linkState(link: { revoked_at: Date | string | null; locked_at: Date | string | null; expires_at: Date | string | null }, now = new Date()): LinkState {
  if (link.revoked_at) return 'revoked';
  if (link.locked_at) return 'locked';
  if (link.expires_at && new Date(link.expires_at) <= now) return 'expired';
  return 'ok';
}

/** True when the email address itself gives away the check value, which would defeat the check. */
export function emailGivesAway(email: string, check: string): boolean {
  const c = normaliseCheck(check);
  return c.length >= 3 && normaliseCheck(email).includes(c);
}

/** A short code for an adviser, easy to read aloud: no 0/O, 1/I/L. For example "K7Q-4MP". */
export function makeAdviserCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = () => alphabet[randomInt(alphabet.length)];
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}`;
}

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

// Checks for a typed score, shared by the judge's phone, the coordinator's corrections and the server.
// A value above the maximum is refused with a message, never silently changed to the maximum.
// Scores may have up to two decimal places (decision 3); a third decimal is refused, not rounded.

export type Check = { state: 'blank' } | { state: 'error'; msg: string } | { state: 'ok'; n: number };

export const MAX_DECIMALS = 2;

export function checkScore(raw: string | null | undefined, max: number): Check {
  const v = String(raw ?? '').trim();
  if (v === '') return { state: 'blank' };
  if (!/^\d+(\.\d+)?$/.test(v) && !/^\.\d+$/.test(v)) return { state: 'error', msg: `Numbers only. You typed “${v}”, so it is not counted yet.` };
  if ((v.split('.')[1] ?? '').length > MAX_DECIMALS) return { state: 'error', msg: `Use at most two decimal places. You typed ${v}, so it is not counted yet.` };
  const n = parseFloat(v);
  if (n > max) return { state: 'error', msg: `Max is ${max}. You typed ${v}, so it is not counted yet.` };
  return { state: 'ok', n };
}

/** Server-side check of a value that arrived as JSON. Returns an error message, or null when acceptable. */
export function refuseReason(value: unknown, max: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not a number.';
  if (value < 0) return 'Scores cannot be negative.';
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return `Use at most two decimal places. ${value} was refused.`;
  if (value > max) return `Max is ${max}. ${value} was refused.`;
  return null;
}

/**
 * Storage keys: criteria are "c:<category>:<index>", member fields are "m:<student id>:<field>",
 * and a member's absence from the defense is "a:<student id>:absent" (1 = absent, null = present).
 */
export const critKey = (cat: string, i: number) => `c:${cat}:${i}`;
export const memberKey = (studentId: string, field: string) => `m:${studentId}:${field}`;
export const absentKey = (studentId: string) => `a:${studentId}:absent`;

export const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

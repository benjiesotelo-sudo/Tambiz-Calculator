// Checks for a typed score, shared by the judge's phone and the server.
// A value above the maximum is refused with a message, never silently changed to the maximum.

export type Check = { state: 'blank' } | { state: 'error'; msg: string } | { state: 'ok'; n: number };

export function checkScore(raw: string | null | undefined, max: number): Check {
  const v = String(raw ?? '').trim();
  if (v === '') return { state: 'blank' };
  if (!/^\d+(\.\d+)?$/.test(v) && !/^\.\d+$/.test(v)) return { state: 'error', msg: `Numbers only. You typed “${v}”, so it is not counted yet.` };
  const n = parseFloat(v);
  if (n > max) return { state: 'error', msg: `Max is ${max}. You typed ${v}, so it is not counted yet.` };
  return { state: 'ok', n };
}

/** Server-side check of a value that arrived as JSON. Returns an error message, or null when acceptable. */
export function refuseReason(value: unknown, max: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not a number.';
  if (value < 0) return 'Scores cannot be negative.';
  if (value > max) return `Max is ${max}. ${value} was refused.`;
  return null;
}

/** Storage keys: criteria are "c:<category>:<index>", member fields are "m:<student id>:<field>". */
export const critKey = (cat: string, i: number) => `c:${cat}:${i}`;
export const memberKey = (studentId: string, field: string) => `m:${studentId}:${field}`;

export const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

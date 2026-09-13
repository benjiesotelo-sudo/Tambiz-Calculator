// Decisions 8 and 10: private link rules, the adviser ranking, and keeping previews off the real database.
import { describe, expect, it } from 'vitest';
import { databaseUrl } from '@/lib/db';
import { checkMatches, emailGivesAway, linkState, makeAdviserCode, normaliseCheck, ordinal } from '@/lib/link-rules';
import { adviserRanking, type GroupResult } from '@/lib/scoring';

describe('private links', () => {
  it('the check ignores spaces, dashes and letter case', () => {
    expect(checkMatches(' 2023-010457 ', '2023010457')).toBe(true);
    expect(checkMatches('k7q 4mp', 'K7Q-4MP')).toBe(true);
    expect(checkMatches('2023010458', '2023010457')).toBe(false);
    expect(checkMatches('', '')).toBe(false);
  });

  it('a link is closed when withdrawn, locked or past its expiry, and open otherwise', () => {
    const now = new Date('2027-05-01T00:00:00Z');
    const base = { revoked_at: null, locked_at: null, expires_at: new Date('2027-05-31T00:00:00Z') };
    expect(linkState(base, now)).toBe('ok');
    expect(linkState({ ...base, expires_at: null }, now)).toBe('ok');
    expect(linkState({ ...base, expires_at: new Date('2027-04-30T00:00:00Z') }, now)).toBe('expired');
    expect(linkState({ ...base, locked_at: now }, now)).toBe('locked');
    expect(linkState({ ...base, revoked_at: now, locked_at: now }, now)).toBe('revoked');
  });

  it('warns when an email address contains the check value', () => {
    expect(emailGivesAway('2023010457@tambiz.demo', '2023010457')).toBe(true);
    expect(emailGivesAway('andrea.delacruz@feu.edu.ph', '2023010457')).toBe(false);
  });

  it('adviser codes are six readable characters', () => {
    for (let i = 0; i < 50; i++) expect(makeAdviserCode()).toMatch(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/);
    expect(normaliseCheck('K7Q-4MP')).toBe('K7Q4MP');
  });

  it('ordinals', () => expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']));
});

describe('adviser ranking (decision 10)', () => {
  const g = (overall: number | null, complete = true): GroupResult => ({
    id: 'x', name: 'x', categories: [], defense: overall, booth: overall, defenseComplete: complete, boothComplete: complete,
    overall, complete, accepted: false, overallRank: null,
  });

  it('ranks advisers by the average overall % of their groups, tied advisers sharing a position', () => {
    const r = adviserRanking([
      { adviserId: 'santos', result: g(90) },
      { adviserId: 'santos', result: g(80) },
      { adviserId: 'uy', result: g(85) },
      { adviserId: 'ocampo', result: g(70) },
    ]);
    expect([r.get('santos'), r.get('uy'), r.get('ocampo')]).toEqual([
      { average: 85, rank: 1, of: 3, groups: 2 },
      { average: 85, rank: 1, of: 3, groups: 1 },
      { average: 70, rank: 3, of: 3, groups: 1 },
    ]);
  });

  it('uses the two-decimal percentages people see', () => {
    // 80.004 and 80.001 both show as 80.00%, so these advisers tie.
    const r = adviserRanking([{ adviserId: 'a', result: g(80.004) }, { adviserId: 'b', result: g(80.001) }]);
    expect([r.get('a')!.rank, r.get('b')!.rank]).toEqual([1, 1]);
  });

  it('an incomplete group does not count, and an adviser with none ranked has no position', () => {
    const r = adviserRanking([
      { adviserId: 'a', result: g(90) },
      { adviserId: 'a', result: g(10, false) },
      { adviserId: 'b', result: g(50, false) },
      { adviserId: null, result: g(99) },
    ]);
    expect(r.get('a')).toEqual({ average: 90, rank: 1, of: 1, groups: 1 });
    expect(r.has('b')).toBe(false);
  });
});

describe('preview deployments stay off the real database', () => {
  it('a Vercel preview ignores DATABASE_URL unless told otherwise', () => {
    expect(databaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: 'postgresql://real' })).toBeUndefined();
    expect(databaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: 'postgresql://real', TAMBIZ_PREVIEW_DATABASE: '1' })).toBe('postgresql://real');
    expect(databaseUrl({ VERCEL_ENV: 'production', DATABASE_URL: 'postgresql://real' })).toBe('postgresql://real');
    expect(databaseUrl({ DATABASE_URL: '' })).toBeUndefined();
  });
});

// Reference answers for the scoring rules.
// Cases A-D began as the 14 answers index.html gives (design research, evidence/golden-rules.js). The coordinator's
// decisions of 14 September 2026 deliberately changed some of them; each such test names index.html's old answer
// and the decision that replaced it, so it would fail under the old behaviour.
import { describe, expect, it } from 'vitest';
import { DEFAULT_RUBRIC as R } from '@/lib/rubric';
import {
  categoryPct,
  categoryScore,
  computeResults,
  finalGrade,
  fmt2,
  fmtPct,
  halfPct,
  halfScore,
  leaderboard,
  letterGrade,
  memberScore,
  memberTotal,
  overallPct,
  rankMap,
  round2,
  type SheetValues,
} from '@/lib/scoring';
import { checkScore, refuseReason } from '@/lib/sheet';

const D = R.halves.defense.categories;
const B = R.halves.booth.categories;
const rep = <T,>(n: number, v: T) => Array<T>(n).fill(v);
const blank = (n: number) => rep<number | null>(n, null);
const def = (ep: (number | null)[], inf: (number | null)[], paper: (number | null)[], pd: (number | null)[]): SheetValues => ({ ep, inf, paper, pd });
const booth = (bbpb: (number | null)[], si: (number | null)[], bpd: (number | null)[]): SheetValues => ({ bbpb, si, bpd });
const r4 = (x: number | null) => (x === null ? null : Math.round(x * 10000) / 10000);
/** Every criterion of a half filled with the same share of its maximum. */
const share = (cats: typeof D, s: number, over: Record<string, (number | null)[]> = {}): SheetValues =>
  Object.fromEntries(cats.map((c) => [c.key, over[c.key] ?? c.maxes.map((m) => m * s)]));

type G = { id: string; name: string; defense: SheetValues[]; booth: SheetValues[]; accepted?: boolean };
const dPct = (g: G) => halfPct(g.defense, D);
const bPct = (g: G) => halfPct(g.booth, B);
const ov = (g: G) => overallPct(dPct(g), bPct(g), R);
const ep = (g: G) => categoryPct(g.defense, D[0]);

describe('a category tie with a group whose overall is incomplete (decision 4)', () => {
  // Both groups have Elevator Pitch at exactly 85.00%. P's booth is missing one score, so P's overall is not ranked.
  const P: G = { id: 'p', name: 'P', defense: [share(D, 0.85)], booth: [share(B, 0.9, { bbpb: B[0].maxes.map((m, i) => (i === 0 ? null : m * 0.9)) })] };
  const Q: G = { id: 'q', name: 'Q', defense: [share(D, 0.85)], booth: [share(B, 0.6)] };
  const P2: G = { ...P, id: 'p2', name: 'P2' };
  const epRank = (groups: G[]) => Object.fromEntries(computeResults(R, groups).groups.map((g) => [g.id, g.categories[0].rank]));

  it('the group with a known overall ranks first, whatever the list order (before: the first group listed took rank 1)', () => {
    expect(epRank([P, Q])).toEqual({ p: 2, q: 1 });
    expect(epRank([Q, P])).toEqual({ p: 2, q: 1 });
    expect(computeResults(R, [P, Q]).leaderboards[0].entries.map((e) => [e.name, e.rank])).toEqual([['Q', 1], ['P', 2]]);
  });

  it('two groups tied with no known overall share the rank', () => {
    expect(epRank([P, Q, P2])).toEqual({ p: 2, q: 1, p2: 2 });
  });

  it('rankMap puts a null tie-breaker after a known one', () => {
    const items = [{ s: 50, tb: null }, { s: 50, tb: 10 }, { s: 50, tb: null }];
    const rank = rankMap(items, (x) => x.s, (x) => x.tb);
    expect(items.map((_, i) => rank(i))).toEqual([2, 1, 2]);
  });
});

describe('golden case A: blank judges skipped; unscored categories and halves stay out (decision 1)', () => {
  const A: G = {
    id: 'a', name: 'A', booth: [],
    defense: [def(rep(5, 20), blank(4), blank(9), blank(3)), def([10, null, 10, 10, 10], blank(4), blank(9), blank(3))],
  };
  it('A Elevator Pitch % (avg 15,20,15,15,15 of 100), unchanged from index.html', () => expect(r4(ep(A))).toBe(80));
  it('A Elevator Pitch is complete: every criterion has a score', () => expect(categoryScore(A.defense, D[0]).complete).toBe(true));
  it('A Informercial % (nothing entered) is a dash', () => expect(categoryPct(A.defense, D[1])).toBeNull());
  it('A defense half is 80 over the one scored category, and incomplete (index.html: 20, counting three zeros)', () => {
    expect(r4(dPct(A))).toBe(80);
    expect(halfScore(A.defense, D).complete).toBe(false);
  });
  it('A booth half (nothing entered) is a dash', () => expect(bPct(A)).toBeNull());
  it('A overall is the defense half alone, 80 (index.html: 20 × 0.7 + 0 × 0.3 = 14)', () => expect(r4(ov(A))).toBe(80));
  it('A is not ranked, because it is incomplete', () => {
    const res = computeResults(R, [A]);
    expect(res.groups[0].complete).toBe(false);
    expect(res.groups[0].overallRank).toBeNull();
    expect(res.groups[0].categories[0].rank).toBe(1);
    expect(res.leaderboards.find((l) => l.key === 'overall')!.entries).toEqual([]);
  });
});

describe('decision 1: a blank is never a zero, but a typed zero counts', () => {
  it('a criterion nobody scored stays out of its category (index.html: 80, counting it as zero)', () => {
    const s = categoryScore([def([20, 20, 20, 20, null], blank(4), blank(9), blank(3))], D[0]);
    expect(s).toEqual({ pct: 100, complete: false });
  });
  it('a judge who types 0 is counted, and the category is complete', () => {
    expect(categoryScore([def([0, 20, 20, 20, 20], blank(4), blank(9), blank(3))], D[0])).toEqual({ pct: 80, complete: true });
  });
  it('a criterion is averaged over the judges who scored it, as index.html does', () => {
    // Averages 15, 20, 20, 20, 20: the second judge's blank is skipped, not a zero.
    expect(categoryPct([def([20, 20, 20, 20, 20], [], [], []), def([10, 20, 20, 20, null], [], [], [])], D[0])).toBe(95);
  });
  it('a half averages only the categories that have a percentage (index.html: empty ones count 0)', () => {
    const s = share(D, 0.5, { inf: blank(4) });
    expect(halfScore([s], D)).toEqual({ pct: 50, complete: false });
  });
  it('a group with no booth scores has the defense half as its overall, and no overall rank', () => {
    const g: G = { id: 'x', name: 'X', defense: [share(D, 0.9)], booth: [] };
    const res = computeResults(R, [g]).groups[0];
    expect(r4(res.overall)).toBe(90);
    expect(res.complete).toBe(false);
    expect(res.overallRank).toBeNull();
  });
  it('the coordinator can accept such a group at finalising; it is then ranked on what it has', () => {
    const g: G = { id: 'x', name: 'X', defense: [share(D, 0.9)], booth: [], accepted: true };
    const res = computeResults(R, [g]).groups[0];
    expect([res.accepted, res.overallRank, res.categories.find((c) => c.key === 'bbpb')!.rank]).toEqual([true, 1, null]);
  });
});

describe('golden case B: a category tie is broken by overall everywhere, leaderboard included (decision 4)', () => {
  const alpha: G = { id: 'alpha', name: 'Alpha', defense: [share(D, 1, { ep: rep(5, 16) })], booth: [share(B, 0.5)] };
  const beta: G = { id: 'beta', name: 'Beta', defense: [share(D, 0.5, { ep: rep(5, 16) })], booth: [share(B, 0.5)] };
  const groups = [beta, alpha];
  it('B Elevator Pitch % both groups', () => expect([r4(ep(beta)), r4(ep(alpha))]).toEqual([80, 80]));
  it('B overall Beta, Alpha', () => expect([r4(ov(beta)), r4(ov(alpha))]).toEqual([55.25, 81.5]));
  it('B results table ranks Alpha 1st and Beta 2nd in Elevator Pitch', () => {
    const r = rankMap(groups, ep, ov);
    expect([r(0), r(1)]).toEqual([2, 1]);
  });
  it('B leaderboard now agrees with the table (index.html: Alpha=1, Beta=1)', () => {
    expect(leaderboard(groups, ep, ov).map((e) => `${e.name}=${e.rank}`)).toEqual(['Alpha=1', 'Beta=2']);
    const res = computeResults(R, groups);
    expect(res.groups.map((g) => g.categories[0].rank)).toEqual([2, 1]);
    expect(res.leaderboards[0].entries.map((e) => `${e.name}=${e.rank}`)).toEqual(['Alpha=1', 'Beta=2']);
  });
});

describe('golden case C: ranks use the two-decimal percentages people see (decisions 2 and 4)', () => {
  // Gamma's first judge gives 16.01 where everyone else gives 16, so its Elevator Pitch is 80.00333…%.
  const full = (over?: (number | null)[]) => share(D, 0.5, { ep: over ?? rep(5, 16) });
  const gam: G = { id: 'g', name: 'Gamma', defense: [full([16, 16, 16, 16, 16.01]), full(), full()], booth: [share(B, 0.5)] };
  const del: G = { id: 'd', name: 'Delta', defense: [full(), full(), full()], booth: [share(B, 0.5)] };
  it('C both display 80.00%', () => expect([fmtPct(ep(gam)), fmtPct(ep(del))]).toEqual(['80.00%', '80.00%']));
  it('C both rank 1st, as their shown scores and overalls are equal (index.html: 1st and 2nd)', () => {
    const res = computeResults(R, [gam, del]);
    expect(res.groups.map((g) => g.categories[0].rank)).toEqual([1, 1]);
    expect(res.leaderboards[0].entries.map((e) => `${e.name}=${e.rank}`)).toEqual(['Delta=1', 'Gamma=1']);
  });
  it('C a real difference in the second decimal still ranks', () => {
    const higher: G = { ...gam, defense: [full([16, 16, 16, 16, 16.03]), full(), full()] };
    expect(computeResults(R, [higher, del]).groups.map((g) => g.categories[0].rank)).toEqual([1, 2]);
  });
});

describe('golden case D: member total and final grade', () => {
  const fullG: G = {
    id: 'f', name: 'Full',
    defense: [def(rep(5, 20), rep(4, 10), [5, 20, 10, 10, 10, 10, 10, 10, 15], [25, 25, 50])],
    booth: [booth([10, 10, 5, 5, 5, 5, 5, 5], [10, 15, 15, 10], [15, 15, 10, 2.5, 5, 2.5])],
  };
  const sets = [
    { presentation: 17, communication: 34, qa: 32 },
    { presentation: 15, communication: null, qa: 30 },
    { presentation: null, communication: null, qa: null },
  ];
  it('D defense 100, booth 50, overall 85, unchanged from index.html', () => expect([r4(dPct(fullG)), r4(bPct(fullG)), r4(ov(fullG))]).toEqual([100, 50, 85]));
  it('D member total averages each field over the judges who scored it: 16 + 34 + 31 = 81 (index.html: 64, counting a blank as 0)', () =>
    expect(r4(memberTotal(sets))).toBe(81));
  it('D final grade (81 + 85) / 2 = 83 (index.html: 74.5)', () => expect(r4(finalGrade(memberTotal(sets), ov(fullG)))).toBe(83));
  // Changed on the coordinator's decision of 14 September 2026 (decision 1 applied to member totals): this total was
  // 75, the 45 scored points scaled up to 100, which read like a real total. Now there is no total until every field is scored.
  it('a member field nobody scored leaves no total, not a partial total scaled up to 100 (was 75)', () => {
    expect(memberScore([{ presentation: 15, communication: 30, qa: null }])).toEqual({ total: null, complete: false });
    expect(memberScore([{ presentation: 17.5, communication: null, qa: null }, { presentation: 16 }])).toEqual({ total: null, complete: false });
  });
  it('a member with no scores at all has no total', () => expect(memberScore([{}, { presentation: null }])).toEqual({ total: null, complete: false }));
});

describe('decision 2: one rounding rule, two decimals, for screens and the workbook', () => {
  it('89.85 shows as 89.85 (the first app showed 89.8 on screen and 89.9 in Excel)', () => {
    expect((89.85).toFixed(1)).toBe('89.8');
    expect(Math.round(89.85 * 10) / 10).toBe(89.9);
    expect([round2(89.85), fmt2(89.85), fmtPct(89.85)]).toEqual([89.85, '89.85', '89.85%']);
  });
  it('halves go up, even when the computer holds the average slightly below', () => {
    const avg = (89.84 + 89.85) / 2;
    expect(round2(avg)).toBe(89.85);
    expect([round2(80.004), round2(80.005), round2(0), round2(-4.25), round2(-4.244)]).toEqual([80, 80.01, 0, -4.25, -4.24]);
  });
  it('nothing scored shows a dash', () => expect([fmtPct(null), fmt2(null)]).toEqual(['—', '']));
  it('the final grade is worked out from the two-decimal numbers shown, so they always explain the letter', () => {
    // Member total 80.00 and group overall 88.0008 (shown as 88.00): (80 + 88) / 2 = 84, a B.
    // Unrounded, it would be 84.0004 and round up to 85, a B+, contradicting the numbers on the page.
    const final = finalGrade(80, 88.0008);
    expect(final).toBe(84);
    expect(letterGrade(final, R.grades)!.letter).toBe('B');
  });
});

describe('decision 3: score boxes take up to two decimal places', () => {
  it('two decimals are accepted', () => expect(checkScore('8.75', 10)).toEqual({ state: 'ok', n: 8.75 }));
  it('a third decimal is refused on the phone and on the server (the first app accepted any decimal)', () => {
    expect(checkScore('8.755', 10).state).toBe('error');
    expect(refuseReason(8.755, 10)).toMatch(/two decimal places/);
    expect(refuseReason(0.29, 1)).toBeNull();
  });
  it('the maximum still applies, and is refused rather than clamped', () => {
    expect(checkScore('20.01', 20).state).toBe('error');
    expect(refuseReason(20.01, 20)).toMatch(/Max is 20/);
  });
});

describe('letter grades: round up to a whole number, then look up the band', () => {
  const cases: [number, number, string, number][] = [
    [84.5, 85, 'B+', 3.5], [74.5, 75, 'C+', 2.5], [84, 84, 'B', 3], [84.0000000001, 84, 'B', 3],
    [49.2, 50, 'D', 1], [49, 49, 'F', 0], [56.01, 57, 'D+', 1.5], [63.9, 64, 'C', 2], [70.5, 71, 'C+', 2.5],
    [77.1, 78, 'B', 3], [91.3, 92, 'A', 4], [100, 100, 'A', 4], [0, 0, 'F', 0],
  ];
  for (const [final, rounded, letter, qp] of cases) {
    it(`${final} becomes ${rounded}, ${letter}`, () => expect(letterGrade(final, R.grades)).toEqual({ rounded, letter, qualityPoints: qp }));
  }
  it('no final grade gives no letter', () => expect(letterGrade(null, R.grades)).toBeNull());
});

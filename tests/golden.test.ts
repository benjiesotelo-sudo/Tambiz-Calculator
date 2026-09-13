// The 14 reference answers from evidence/golden-rules.js in the design research, computed by index.html.
// The new scoring must reproduce every one of them exactly.
import { describe, expect, it } from 'vitest';
import { DEFAULT_RUBRIC as R } from '@/lib/rubric';
import { categoryPct, computeResults, finalGrade, halfPct, leaderboard, letterGrade, memberTotal, overallPct, rankMap, type SheetValues } from '@/lib/scoring';

const D = R.halves.defense.categories;
const B = R.halves.booth.categories;
const rep = <T,>(n: number, v: T) => Array<T>(n).fill(v);
const blank = (n: number) => rep<number | null>(n, null);
const def = (ep: (number | null)[], inf: (number | null)[], paper: (number | null)[], pd: (number | null)[]): SheetValues => ({ ep, inf, paper, pd });
const booth = (bbpb: (number | null)[], si: (number | null)[], bpd: (number | null)[]): SheetValues => ({ bbpb, si, bpd });
const r4 = (x: number | null) => (x === null ? null : Math.round(x * 10000) / 10000);

type G = { id: string; name: string; defense: SheetValues[]; booth: SheetValues[] };
const dPct = (g: G) => halfPct(g.defense, D);
const bPct = (g: G) => halfPct(g.booth, B);
const ov = (g: G) => overallPct(dPct(g), bPct(g), R);
const ep = (g: G) => categoryPct(g.defense, D[0]);

describe('golden case A: blank judges skipped, empty categories and halves count zero', () => {
  const A: G = {
    id: 'a', name: 'A', booth: [],
    defense: [def(rep(5, 20), blank(4), blank(9), blank(3)), def([10, null, 10, 10, 10], blank(4), blank(9), blank(3))],
  };
  it('A Elevator Pitch % (avg 15,20,15,15,15 of 100)', () => expect(r4(ep(A))).toBe(80));
  it('A Informercial % (nothing entered)', () => expect(categoryPct(A.defense, D[1])).toBeNull());
  it('A defense half (80+0+0+0)/4', () => expect(r4(dPct(A))).toBe(20));
  it('A booth half (nothing entered)', () => expect(bPct(A)).toBeNull());
  it('A overall 20*0.7 + 0*0.3', () => expect(r4(ov(A))).toBe(14));
});

describe('golden case B: results table breaks ties by overall, leaderboard does not', () => {
  const alpha: G = {
    id: 'alpha', name: 'Alpha',
    defense: [def(rep(5, 16), rep(4, 5), blank(9), blank(3))],
    booth: [booth([20, 20, 10, 10, 10, 10, 10, 10], blank(4), blank(6))],
  };
  const beta: G = { id: 'beta', name: 'Beta', defense: [def(rep(5, 16), rep(4, 5), blank(9), blank(3))], booth: [] };
  const groups = [beta, alpha];
  const epRank = rankMap(groups, ep, ov);
  it('B Elevator Pitch % both groups', () => expect([r4(ep(beta)), r4(ep(alpha))]).toEqual([80, 80]));
  it('B overall Beta, Alpha', () => expect([r4(ov(beta)), r4(ov(alpha))]).toEqual([22.75, 32.75]));
  it('B Results-table EP rank [Beta, Alpha] (tie broken by overall)', () => expect([epRank(0), epRank(1)]).toEqual([2, 1]));
  it('B Leaderboard EP ranks (tie kept, then name order)', () =>
    expect(leaderboard(groups, ep).map((e) => `${e.name}=${e.rank}`)).toEqual(['Alpha=1', 'Beta=1']));
  it('B holds through computeResults too', () => {
    const res = computeResults(R, groups);
    expect(res.groups.map((g) => g.categories[0].rank)).toEqual([2, 1]);
    expect(res.leaderboards[0].entries.map((e) => `${e.name}=${e.rank}`)).toEqual(['Alpha=1', 'Beta=1']);
  });
});

describe('golden case C: ranking uses unrounded values', () => {
  const gam: G = { id: 'g', name: 'Gamma', defense: [def([16, 16, 16, 16, 16.04], blank(4), blank(9), blank(3))], booth: [] };
  const del: G = { id: 'd', name: 'Delta', defense: [def([16, 16, 16, 16, 16.01], blank(4), blank(9), blank(3))], booth: [] };
  const rC = rankMap([gam, del], ep, ov);
  it('C displayed EP % (toFixed(1))', () => expect([ep(gam)!.toFixed(1), ep(del)!.toFixed(1)]).toEqual(['80.0', '80.0']));
  it('C EP ranks [Gamma, Delta]', () => expect([rC(0), rC(1)]).toEqual([1, 2]));
});

describe('golden case D: member total and final grade', () => {
  const full: G = {
    id: 'f', name: 'Full',
    defense: [def(rep(5, 20), rep(4, 10), [5, 20, 10, 10, 10, 10, 10, 10, 15], [25, 25, 50])],
    booth: [booth([10, 10, 5, 5, 5, 5, 5, 5], [10, 15, 15, 10], [15, 15, 10, 2.5, 5, 2.5])],
  };
  const total = memberTotal([
    { presentation: 17, communication: 34, qa: 32 },
    { presentation: 15, communication: null, qa: 30 },
    { presentation: null, communication: null, qa: null },
  ]);
  it('D defense 100, booth 50, overall', () => expect([r4(dPct(full)), r4(bPct(full)), r4(ov(full))]).toEqual([100, 50, 85]));
  it('D member total avg(83, 45), third judge ignored', () => expect(r4(total)).toBe(64));
  it('D final grade (64 + 85) / 2', () => expect(r4(finalGrade(total, ov(full)))).toBe(74.5));
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

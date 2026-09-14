// Item 14: judge profiles compare a judge only with the co-judges who scored the same group in the same half.
import { describe, expect, it } from 'vitest';
import { agreementLevel, describe as describeJudge, judgeProfile, rankCorrelation, sheetFlags, spreadLevel, type ProfileSheet } from '@/lib/judge-profiles';
import { DEFAULT_RUBRIC as R } from '@/lib/rubric';
import type { SheetValues } from '@/lib/scoring';

const D = R.halves.defense.categories;
const B = R.halves.booth.categories;
/** A defense sheet with every criterion at the same share of its maximum. */
const share = (s: number, over: Record<string, (number | null)[]> = {}): SheetValues => Object.fromEntries(D.map((c) => [c.key, over[c.key] ?? c.maxes.map((m) => m * s)]));
const sheet = (judge: string, group: number, s: number, over?: Record<string, (number | null)[]>): ProfileSheet => ({
  judgeId: judge,
  judgeName: judge.toUpperCase(),
  groupId: `g${group}`,
  groupCode: `G0${group}`,
  groupName: `Group ${group}`,
  half: 'defense',
  values: share(s, over),
});

describe('judge profiles', () => {
  // Eight groups of falling quality, 80% down to 45%. Judge B marks on the quality; A marks 4 points below B;
  // C marks around the same middle (62.5%) but spreads groups 1.8 times as far apart.
  const quality = [0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45];
  const sheets: ProfileSheet[] = quality.flatMap((q, i) => [
    sheet('a', i + 1, q - 0.04),
    sheet('b', i + 1, q),
    sheet('c', i + 1, 0.625 + (q - 0.625) * 1.8),
  ]);

  it('marks at: the mean gap to the co-judges on the same groups, in points', () => {
    const a = judgeProfile('a', 'A', sheets, R);
    // Group 1: A gives 76; B gives 80 and C 94, an average of 87, so the gap is −11. Across all eight the gaps average −4.
    expect(a.marksAt).toBeCloseTo(-4, 6);
    expect(a.groups).toBe(8);
    expect(a.halves.defense.rows[0]).toMatchObject({ groupCode: 'G01', their: expect.closeTo(76, 6), others: expect.closeTo(87, 6), gap: expect.closeTo(-11, 6) });
  });

  it('a strict judge who orders groups like the panel agrees highly', () => {
    const a = judgeProfile('a', 'A', sheets, R);
    expect(a.agreement).toBe('high');
    expect(a.halves.defense.rows.map((r) => [r.theirOrder, r.panelOrder])).toEqual(quality.map((_, i) => [i + 1, i + 1]));
  });

  it('separates groups: wide for the judge who spreads scores further than the others', () => {
    expect(judgeProfile('c', 'C', sheets, R).separation).toBe('wide');
    expect(judgeProfile('b', 'B', sheets, R).separation).toBe('narrow');
  });

  it('only co-judges of the same group and half count: a judge alone on a group has no comparison', () => {
    const solo = [...sheets, sheet('d', 9, 0.5)];
    const d = judgeProfile('d', 'D', solo, R);
    expect(d.marksAt).toBeNull();
    expect(d.halves.defense.uncompared).toHaveLength(1);
    expect(d.summary).toMatch(/nothing to compare/);
    // Booth scores for the same group are another half, and are never compared with defense.
    const boothOnly: ProfileSheet = { ...sheet('e', 1, 0.5), half: 'booth', values: Object.fromEntries(B.map((c) => [c.key, c.maxes.map((m) => m / 2)])) };
    expect(judgeProfile('e', 'E', [...sheets, boothOnly], R).marksAt).toBeNull();
  });

  it('a criterion only one side scored cannot open a gap', () => {
    // X leaves Elevator Pitch blank on group 1; Y scores it low. Compared only on what both scored, they agree exactly.
    const x = sheet('x', 1, 0.8, { ep: [null, null, null, null, null] });
    const y = sheet('y', 1, 0.8, { ep: [0, 0, 0, 0, 0] });
    const p = judgeProfile('x', 'X', [x, y], R);
    expect(p.marksAt).toBeCloseTo(0, 9);
    expect(p.halves.defense.rows[0].flags).toContain('5 criteria left blank');
  });

  it('flags: the same mark down a whole category, blanks, and a score far from both co-judges', () => {
    expect(sheetFlags(share(0.5, { paper: [8, 8, 8, 8, 8, 8, 8, 8, 8] }), D)).toContain('8 entered down all 9 criteria of Paper');
    const oneBlank = sheetFlags(share(0.5, { pd: [10, null, 20] }), D);
    expect(oneBlank).toContain('1 criterion left blank');
    expect(oneBlank.some((t) => t.includes('Product Demo'))).toBe(false);
    const far = [sheet('f', 1, 0.6), sheet('g', 1, 0.75), sheet('h', 1, 0.72)];
    expect(judgeProfile('f', 'F', far, R).halves.defense.rows[0].flags[0]).toBe('Far from both co-judges (75.00, 72.00)');
    const near = [sheet('f', 1, 0.7), sheet('g', 1, 0.75), sheet('h', 1, 0.72)];
    expect(judgeProfile('f', 'F', near, R).halves.defense.rows[0].flags.some((t) => t.startsWith('Far'))).toBe(false);
  });

  it('describes in plain words and never prescribes', () => {
    expect(describeJudge({ marksAt: 1.1, separation: 'wide', agreement: 'high' })).toBe(
      'Scores about one point above the panel, spreads groups further apart than the others do, and ranks them much as the panel does.',
    );
    expect(describeJudge({ marksAt: -4.2, separation: 'normal', agreement: 'high' })).toMatch(/^Scores about four points below the panel/);
    expect(describeJudge({ marksAt: 3.1, separation: 'narrow', middle: { low: 86, high: 91 }, agreement: 'medium' })).toBe(
      'Scores about three points above the panel, gives most groups between 86 and 91, and ranks them partly as the panel does.',
    );
    for (const s of [judgeProfile('a', 'A', sheets, R).summary, judgeProfile('c', 'C', sheets, R).summary]) expect(s).not.toMatch(/\b(keep|avoid|remove|drop|bad|poor|good|should)\b/i);
  });

  it('rank correlation and labels', () => {
    expect(rankCorrelation([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 9);
    expect(rankCorrelation([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 9);
    expect(rankCorrelation([5, 5, 5], [1, 2, 3])).toBeNull();
    expect([agreementLevel(0.8), agreementLevel(0.5), agreementLevel(0.1)]).toEqual(['high', 'medium', 'low']);
    expect([spreadLevel(0.5), spreadLevel(1), spreadLevel(1.5)]).toEqual(['narrow', 'normal', 'wide']);
  });
});

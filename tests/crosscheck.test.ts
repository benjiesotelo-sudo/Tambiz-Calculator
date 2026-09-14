// Runs the original scoring functions inside index.html (extracted unchanged, as evidence/golden-rules.js does)
// on random events and checks the new scoring gives the same numbers and ranks wherever the rules still agree.
//
// The coordinator's decisions of 14 September 2026 deliberately changed three things, so the comparison is limited:
//  - Blanks (decision 1): index.html counts an unscored criterion, category or half as zero. Percentages are
//    compared only for categories, halves and overalls where every criterion has a score; there the two agree
//    exactly. Parts with gaps are covered by tests/golden.test.ts instead.
//  - Ranks (decisions 2 and 4): the app ranks on two-decimal values, and only complete groups. Ranks are compared
//    on events where every group is complete, against index.html's own rankFn given the same rounded scores.
//  - Member totals (decision 1): index.html counts a judge's blank field as zero. Totals are compared only where
//    each judge filled all three fields or none, and to nine decimals, because the new rule adds per-field averages.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_RUBRIC as R } from '@/lib/rubric';
import { computeResults, memberTotal, round2, type ScoredGroup, type SheetValues } from '@/lib/scoring';

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('// ── Config');
const end = html.indexOf('// ── Build Input Table');
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const api = new Function(
  html.slice(start, end) +
    '\nreturn { setGroups: g => { groups = g; }, catScore, boothCatScore, overallDefenseScore, overallBoothScore, overallScore, rankFn, memberTotal };',
)();

// Seeded random numbers so a failure is reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const r2 = (x: number | null) => (x === null ? null : round2(x));

describe('new scoring matches index.html wherever nothing is left blank', () => {
  for (let trial = 0; trial < 60; trial++) {
    // Even trials: the first judge in each half fills every box, so every group is complete and ranks are compared.
    // Odd trials: gaps anywhere, and only the complete parts are compared.
    const covered = trial % 2 === 0;
    it(`random event ${trial}${covered ? ' (every group complete)' : ' (with gaps)'}`, () => {
      const rand = rng(trial + 1);
      const val = (max: number, allowBlank: boolean) => {
        const r = rand();
        if (allowBlank && r < 0.25) return null;
        if (r < 0.35) return max; // many ties
        return Math.round(rand() * max * 4) / 4;
      };
      const sheet = (half: 'defense' | 'booth', emptyChance: number, allowBlank = true): SheetValues =>
        Object.fromEntries(R.halves[half].categories.map((c) => [c.key, c.maxes.map((m) => (allowBlank && rand() < emptyChance ? null : val(m, allowBlank)))]));
      const sheets = (half: 'defense' | 'booth') =>
        Array.from({ length: covered ? 1 + Math.floor(rand() * 3) : Math.floor(rand() * 4) }, (_, i) =>
          covered && i === 0 ? sheet(half, 0, false) : sheet(half, rand() < 0.2 ? 1 : 0.1),
        );
      const nGroups = 2 + Math.floor(rand() * 10);
      const groups: ScoredGroup[] = Array.from({ length: nGroups }, (_, gi) => ({
        id: `g${gi}`,
        name: `Group ${String.fromCharCode(65 + ((gi * 7) % 26))}${gi}`,
        defense: sheets('defense'),
        booth: sheets('booth'),
      }));

      const toOld = (list: SheetValues[], half: 'defense' | 'booth') =>
        list.map((s, i) => ({ name: `P${i}`, scores: R.halves[half].categories.flatMap((c) => s[c.key].map((v) => (v === null ? '' : v))) }));
      const old = groups.map((g) => ({ name: g.name, panelists: toOld(g.defense, 'defense'), boothPanelists: toOld(g.booth, 'booth'), members: [] }));
      api.setGroups(old);

      const res = computeResults(R, groups);
      const nDef = R.halves.defense.categories.length;
      const oldCat = (ci: number) => (g: unknown) => (ci < nDef ? api.catScore(g, ci) : api.boothCatScore(g, ci - nDef));
      let compared = 0;
      res.groups.forEach((g, gi) => {
        g.categories.forEach((c, ci) => {
          const want = oldCat(ci)(old[gi]);
          if (c.pct === null) expect(want).toBeNull();
          if (c.complete) {
            expect(c.pct).toBe(want);
            compared++;
          }
        });
        if (g.defense === null) expect(api.overallDefenseScore(old[gi])).toBeNull();
        if (g.booth === null) expect(api.overallBoothScore(old[gi])).toBeNull();
        if (g.defenseComplete) expect(g.defense).toBe(api.overallDefenseScore(old[gi]));
        if (g.boothComplete) expect(g.booth).toBe(api.overallBoothScore(old[gi]));
        if (g.complete) expect(g.overall).toBe(api.overallScore(old[gi]));
      });
      if (covered) expect(compared).toBe(nGroups * res.groups[0].categories.length);

      if (!covered) return;
      expect(res.groups.every((g) => g.complete)).toBe(true);
      const ovRounded = (g: unknown) => r2(api.overallScore(g));
      for (let ci = 0; ci < res.groups[0].categories.length; ci++) {
        const oldRank = api.rankFn((g: unknown) => r2(oldCat(ci)(g)), ovRounded);
        res.groups.forEach((g, gi) => expect(g.categories[ci].rank).toBe(oldRank(gi)));
        // The leaderboard shows exactly the table's ranks.
        for (const e of res.leaderboards[ci].entries) expect(e.rank).toBe(res.groups.find((g) => g.id === e.id)!.categories[ci].rank);
      }
      const oldOv = api.rankFn(ovRounded);
      res.groups.forEach((g, gi) => expect(g.overallRank).toBe(oldOv(gi)));
    });
  }

  it('member totals match when each judge filled all three fields or none', () => {
    const rand = rng(99);
    for (let i = 0; i < 300; i++) {
      const sets = Array.from({ length: Math.floor(rand() * 4) }, () =>
        rand() < 0.25
          ? { presentation: null, communication: null, qa: null }
          : { presentation: Math.round(rand() * 200) / 10, communication: Math.round(rand() * 400) / 10, qa: Math.round(rand() * 400) / 10 },
      );
      const oldSets = sets.map((s) => ({ presentation: s.presentation ?? '', communication: s.communication ?? '', qa: s.qa ?? '' }));
      const want = api.memberTotal({ scores: oldSets });
      const got = memberTotal(sets);
      if (want === null) expect(got).toBeNull();
      else expect(got).toBeCloseTo(want, 9);
    }
  });
});

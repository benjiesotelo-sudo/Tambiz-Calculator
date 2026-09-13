// Runs the original scoring functions inside index.html (extracted unchanged, as evidence/golden-rules.js does)
// on hundreds of random groups and checks the new scoring gives the same numbers and ranks.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_RUBRIC as R } from '@/lib/rubric';
import { computeResults, memberTotal, type ScoredGroup, type SheetValues } from '@/lib/scoring';

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

describe('new scoring matches index.html on random events', () => {
  for (let trial = 0; trial < 40; trial++) {
    it(`random event ${trial}`, () => {
      const rand = rng(trial + 1);
      const val = (max: number) => {
        const r = rand();
        if (r < 0.25) return null;
        if (r < 0.35) return max; // many ties
        return Math.round(rand() * max * 2) / 2;
      };
      const sheet = (half: 'defense' | 'booth', emptyChance: number): SheetValues =>
        Object.fromEntries(R.halves[half].categories.map((c) => [c.key, c.maxes.map((m) => (rand() < emptyChance ? null : val(m)))]));
      const nGroups = 2 + Math.floor(rand() * 10);
      const groups: ScoredGroup[] = Array.from({ length: nGroups }, (_, gi) => ({
        id: `g${gi}`,
        name: `Group ${String.fromCharCode(65 + ((gi * 7) % 26))}${gi}`,
        defense: Array.from({ length: Math.floor(rand() * 4) }, () => sheet('defense', rand() < 0.2 ? 1 : 0.1)),
        booth: Array.from({ length: Math.floor(rand() * 4) }, () => sheet('booth', rand() < 0.2 ? 1 : 0.1)),
      }));

      const toOld = (sheets: SheetValues[], half: 'defense' | 'booth') =>
        sheets.map((s, i) => ({ name: `P${i}`, scores: R.halves[half].categories.flatMap((c) => s[c.key].map((v) => (v === null ? '' : v))) }));
      const old = groups.map((g) => ({
        name: g.name,
        panelists: toOld(g.defense, 'defense'),
        boothPanelists: toOld(g.booth, 'booth'),
        members: [],
      }));
      api.setGroups(old);

      const res = computeResults(R, groups);
      const nDef = R.halves.defense.categories.length;
      res.groups.forEach((g, gi) => {
        g.categories.forEach((c, ci) => {
          const want = ci < nDef ? api.catScore(old[gi], ci) : api.boothCatScore(old[gi], ci - nDef);
          expect(c.pct).toBe(want);
        });
        expect(g.defense).toBe(api.overallDefenseScore(old[gi]));
        expect(g.booth).toBe(api.overallBoothScore(old[gi]));
        expect(g.overall).toBe(api.overallScore(old[gi]));
      });

      const ov = (g: unknown) => api.overallScore(g);
      for (let ci = 0; ci < res.groups[0].categories.length; ci++) {
        const fn = ci < nDef ? (g: unknown) => api.catScore(g, ci) : (g: unknown) => api.boothCatScore(g, ci - nDef);
        const oldRank = api.rankFn(fn, ov);
        res.groups.forEach((g, gi) => expect(g.categories[ci].rank).toBe(oldRank(gi)));
      }
      const oldOv = api.rankFn(ov);
      res.groups.forEach((g, gi) => expect(g.overallRank).toBe(oldOv(gi)));
    });
  }

  it('member totals match on random judges', () => {
    const rand = rng(99);
    for (let i = 0; i < 300; i++) {
      const sets = Array.from({ length: Math.floor(rand() * 4) }, () => ({
        presentation: rand() < 0.3 ? null : Math.round(rand() * 200) / 10,
        communication: rand() < 0.3 ? null : Math.round(rand() * 400) / 10,
        qa: rand() < 0.3 ? null : Math.round(rand() * 400) / 10,
      }));
      const oldSets = sets.map((s) => ({
        presentation: s.presentation ?? '',
        communication: s.communication ?? '',
        qa: s.qa ?? '',
      }));
      expect(memberTotal(sets)).toBe(api.memberTotal({ scores: oldSets }));
    }
  });
});

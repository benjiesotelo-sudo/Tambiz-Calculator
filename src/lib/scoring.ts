// Scoring rules, ported from index.html (lines 662-746, 808-820, 1153-1175, 1254).
// Pure functions only: the live screens, results, and the Excel export all call these.
// tests/golden.test.ts and tests/crosscheck.test.ts hold them to the original file.

import { categoryMax, type Category, type GradeBand, type Half, type MemberFieldKey, type Rubric } from './rubric';

/** One judge's sheet: for each category key, one value per criterion (null = left blank). */
export type SheetValues = Record<string, (number | null)[]>;

/** One judge's three member fields for one student. */
export type MemberSet = Partial<Record<MemberFieldKey, number | null>>;

export interface ScoredGroup {
  id: string;
  name: string;
  defense: SheetValues[];
  booth: SheetValues[];
}

/** Criterion averages across the judges who filled each one in (index.html:662-671). */
export function criterionAverages(sheets: SheetValues[], cat: Category): (number | null)[] {
  return cat.maxes.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (const s of sheets) {
      const v = s[cat.key]?.[i];
      if (v !== null && v !== undefined) {
        sum += v;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  });
}

/** Category percentage, or null when nothing was entered (index.html:673-682). */
export function categoryPct(sheets: SheetValues[], cat: Category): number | null {
  let sum = 0;
  let hasAny = false;
  for (const v of criterionAverages(sheets, cat)) {
    if (v !== null) {
      sum += v;
      hasAny = true;
    }
  }
  return hasAny ? (sum / categoryMax(cat)) * 100 : null;
}

/** Half percentage: plain average of category percentages, empty categories count 0 (index.html:706-718). */
export function halfPct(sheets: SheetValues[], cats: Category[]): number | null {
  const anyEntered = sheets.some((s) => cats.some((c) => (s[c.key] ?? []).some((v) => v !== null && v !== undefined)));
  if (!anyEntered) return null;
  const pcts = cats.map((c) => categoryPct(sheets, c) ?? 0);
  return pcts.reduce((a, b) => a + b, 0) / cats.length;
}

/** Overall = defense x 0.7 + booth x 0.3, a missing half counts 0 (index.html:720-725). */
export function overallPct(defense: number | null, booth: number | null, rubric: Rubric): number | null {
  if (defense === null && booth === null) return null;
  return (defense ?? 0) * rubric.halves.defense.weight + (booth ?? 0) * rubric.halves.booth.weight;
}

/**
 * Results-table ranking (index.html:727-746). Tied scores share a rank and the next rank is skipped;
 * with a tie-breaker, ties are broken by it and share a rank only when both values match.
 */
export function rankMap<T>(items: T[], scoreFn: (t: T) => number | null, tiebreakerFn?: (t: T) => number | null) {
  const scored = items
    .map((t, i) => ({ i, s: scoreFn(t), tb: tiebreakerFn ? tiebreakerFn(t) : null }))
    .filter((x): x is { i: number; s: number; tb: number | null } => x.s !== null)
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s;
      if (tiebreakerFn && b.tb !== null && a.tb !== null && b.tb !== a.tb) return b.tb - a.tb;
      return 0;
    });
  const ranks = new Map<number, number>();
  scored.forEach((item, pos) => {
    let rank = pos + 1;
    for (let j = 0; j < pos; j++) {
      const sameScore = scored[j].s === item.s;
      const sameTb = !tiebreakerFn || scored[j].tb === item.tb;
      if (sameScore && sameTb) {
        rank = j + 1;
        break;
      }
    }
    ranks.set(item.i, rank);
  });
  return (index: number) => ranks.get(index) ?? null;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  rank: number;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** Top-10 leaderboard (index.html:1153-1175): score only, ties share a rank, tied groups listed by name. */
export function leaderboard<T extends { id: string; name: string }>(items: T[], scoreFn: (t: T) => number | null, limit = 10): LeaderboardEntry[] {
  const sorted = items
    .map((t) => ({ id: t.id, name: t.name, score: scoreFn(t) }))
    .filter((x): x is { id: string; name: string; score: number } => x.score !== null)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : byName(a.name, b.name)));
  let prevScore: number | null = null;
  let prevRank = 0;
  return sorted
    .map((it, idx) => {
      const rank = idx === 0 ? 1 : it.score === prevScore ? prevRank : idx + 1;
      prevScore = it.score;
      prevRank = rank;
      return { ...it, rank };
    })
    .slice(0, limit);
}

/**
 * A member's total (index.html:808-820): the average across judges of each judge's fields added together.
 * A judge who filled any field has blanks counted as 0; a judge who filled none is skipped.
 */
export function memberTotal(sets: MemberSet[], fields: MemberFieldKey[] = ['presentation', 'communication', 'qa']): number | null {
  const totals = sets
    .map((set) => {
      const vals = fields.map((f) => set[f]);
      const hasAny = vals.some((v) => v !== null && v !== undefined);
      return hasAny ? vals.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null;
    })
    .filter((v): v is number => v !== null);
  if (!totals.length) return null;
  return totals.reduce((a, b) => a + b, 0) / totals.length;
}

/** Final grade = (member total + group overall %) / 2 (index.html:1254). */
export function finalGrade(total: number | null, overall: number | null): number | null {
  return total === null || overall === null ? null : (total + overall) / 2;
}

/**
 * Round UP to the nearest whole number, then look up the band: 84.5 becomes 85, a B+.
 * Floating-point noise below one millionth is removed first, so 84.0000000001 stays 84.
 */
export function letterGrade(final: number | null, bands: GradeBand[]): { rounded: number; letter: string; qualityPoints: number } | null {
  if (final === null) return null;
  const rounded = Math.ceil(Math.round(final * 1e6) / 1e6);
  const band = bands.find((b) => rounded >= b.min && rounded <= b.max) ?? (rounded > 100 ? bands[0] : bands[bands.length - 1]);
  return { rounded, letter: band.letter, qualityPoints: band.qualityPoints };
}

/** One decimal, as the original shows and exports (toFixed(1)). */
export const fmt1 = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(1));

// ── Whole-event results ─────────────────────────────────────────────

export interface CategoryResult {
  half: Half;
  key: string;
  name: string;
  pct: number | null;
  rank: number | null;
}

export interface GroupResult {
  id: string;
  name: string;
  categories: CategoryResult[];
  defense: number | null;
  booth: number | null;
  overall: number | null;
  overallRank: number | null;
}

export interface EventResults {
  groups: GroupResult[];
  leaderboards: { key: string; name: string; half: Half | 'overall'; entries: LeaderboardEntry[] }[];
}

export function computeResults(rubric: Rubric, groups: ScoredGroup[]): EventResults {
  const base = groups.map((g) => {
    const defense = halfPct(g.defense, rubric.halves.defense.categories);
    const booth = halfPct(g.booth, rubric.halves.booth.categories);
    const cats = (['defense', 'booth'] as Half[]).flatMap((half) =>
      rubric.halves[half].categories.map((c) => ({
        half,
        key: c.key,
        name: c.name,
        pct: categoryPct(half === 'defense' ? g.defense : g.booth, c),
        rank: null as number | null,
      })),
    );
    return { id: g.id, name: g.name, categories: cats, defense, booth, overall: overallPct(defense, booth, rubric), overallRank: null as number | null };
  });

  const catKeys = base[0]?.categories.map((c) => c.key) ?? [];
  catKeys.forEach((key, ci) => {
    const rank = rankMap(base, (g) => g.categories[ci].pct, (g) => g.overall);
    base.forEach((g, gi) => (g.categories[ci].rank = rank(gi)));
  });
  const ovRank = rankMap(base, (g) => g.overall);
  base.forEach((g, gi) => (g.overallRank = ovRank(gi)));

  const leaderboards: EventResults['leaderboards'] = [];
  (['defense', 'booth'] as Half[]).forEach((half) =>
    rubric.halves[half].categories.forEach((c) => {
      leaderboards.push({
        key: c.key,
        name: c.name,
        half,
        entries: leaderboard(base, (g) => g.categories.find((x) => x.key === c.key)?.pct ?? null),
      });
    }),
  );
  leaderboards.push({ key: 'overall', name: 'Overall', half: 'overall', entries: leaderboard(base, (g) => g.overall) });

  return { groups: base, leaderboards };
}

// Scoring rules, ported from index.html (lines 662-746, 808-820, 1153-1175, 1254) and then changed by the
// coordinator's decisions of 14 September 2026. Where a rule differs from index.html, the comment says so and why.
//
//  1. A blank is never a zero. An unscored criterion, category, half or member field stays out of the arithmetic
//     and the result is marked incomplete. index.html counted an unscored criterion or category as zero against the
//     full maximum, an unscored half as zero in the overall, and a judge's blank member field as zero.
//  2. Percentages are rounded once, by round2(), to two decimals; the screens and the Excel workbook both use it.
//     index.html showed toFixed(1), and the first app's workbook rounded differently from its screens.
//  4. A category tie is broken by overall score everywhere, including the leaderboard, and ranks are worked out
//     on the rounded values people see. index.html's leaderboard ignored overall, and ranked on unrounded values.
//
// Pure functions only: the live screens, results, student and adviser pages, and the Excel export all call these.
// tests/golden.test.ts holds the rules; tests/crosscheck.test.ts holds them to index.html wherever nothing is blank.

import { DEFAULT_RUBRIC, HALVES, type Category, type GradeBand, type Half, type MemberField, type MemberFieldKey, type Rubric } from './rubric';

/** One judge's sheet: for each category key, one value per criterion (null = left blank). */
export type SheetValues = Record<string, (number | null)[]>;

/** One judge's three member fields for one student. */
export type MemberSet = Partial<Record<MemberFieldKey, number | null>>;

export interface ScoredGroup {
  id: string;
  name: string;
  defense: SheetValues[];
  booth: SheetValues[];
  /** The coordinator finalised this group without every score, with a recorded reason (decision 5). */
  accepted?: boolean;
}

/** A percentage worked out from whatever was scored, and whether everything was scored. */
export interface Part {
  pct: number | null;
  complete: boolean;
}

const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;

// ── rounding (decision 2) ───────────────────────────────────────────

/**
 * The one rounding rule: two decimals, halves away from zero. Floating-point noise below one millionth is removed
 * first, so an average that is really 89.845 becomes 89.85 even when the computer holds it as 89.84499999999999.
 */
export function round2(n: number): number {
  const abs = Math.abs(Math.round(n * 1e6) / 1e6);
  const r = Number(`${Math.round(Number(`${abs}e2`))}e-2`);
  return n < 0 && r !== 0 ? -r : r;
}

/** Two decimals as text, or '' for nothing. */
export const fmt2 = (n: number | null | undefined) => (has(n) ? round2(n).toFixed(2) : '');

/** A percentage for the screen: "89.85%", or a dash when nothing was scored. */
export const fmtPct = (n: number | null | undefined) => (has(n) ? `${fmt2(n)}%` : '—');

// ── one group ───────────────────────────────────────────────────────

/** Criterion averages across the judges who filled each one in (index.html:662-671, unchanged). */
export function criterionAverages(sheets: SheetValues[], cat: Category): (number | null)[] {
  return cat.maxes.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (const s of sheets) {
      const v = s[cat.key]?.[i];
      if (has(v)) {
        sum += v;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  });
}

/**
 * Category percentage over the criteria that have at least one score: their averages added up, divided by their
 * maximums added up. Complete when every criterion has a score. index.html (673-682) divided by the whole
 * category's maximum, so an unscored criterion counted as zero.
 */
export function categoryScore(sheets: SheetValues[], cat: Category): Part {
  const avgs = criterionAverages(sheets, cat);
  let sum = 0;
  let max = 0;
  avgs.forEach((v, i) => {
    if (v !== null) {
      sum += v;
      max += cat.maxes[i];
    }
  });
  return { pct: max > 0 ? (sum / max) * 100 : null, complete: avgs.every((v) => v !== null) };
}

export const categoryPct = (sheets: SheetValues[], cat: Category) => categoryScore(sheets, cat).pct;

/**
 * Half percentage: the plain average of the categories that have a percentage, so every category weighs the same.
 * Complete when every category is. index.html (706-718) counted an empty category as zero.
 */
export function halfScore(sheets: SheetValues[], cats: Category[]): Part {
  const parts = cats.map((c) => categoryScore(sheets, c));
  const scored = parts.filter((p) => p.pct !== null);
  return {
    pct: scored.length ? scored.reduce((a, p) => a + p.pct!, 0) / scored.length : null,
    complete: parts.every((p) => p.complete),
  };
}

export const halfPct = (sheets: SheetValues[], cats: Category[]) => halfScore(sheets, cats).pct;

/**
 * Overall = defense × 0.7 + booth × 0.3 when both halves have a percentage. When only one does, the overall is that
 * half alone: the missing half stays out rather than counting as zero, as it did in index.html (720-725).
 */
export function overallPct(defense: number | null, booth: number | null, rubric: Rubric): number | null {
  if (defense !== null && booth !== null) return defense * rubric.halves.defense.weight + booth * rubric.halves.booth.weight;
  return defense ?? booth;
}

// ── ranking (decision 4) ────────────────────────────────────────────

/**
 * Tied scores share a rank and the next rank is skipped (1, 1, 3), as in index.html:727-746. With a tie-breaker,
 * ties are broken by it and share a rank only when both values match. A null score gets no rank.
 * A null tie-breaker (for example a group whose overall is incomplete) comes after every known one, and two null
 * tie-breakers share the rank, so the order never depends on the order of the list.
 * Callers pass rounded values (round2), so ranks follow what people see.
 */
export function rankMap<T>(items: T[], scoreFn: (t: T) => number | null, tiebreakerFn?: (t: T) => number | null) {
  const scored = items
    .map((t, i) => ({ i, s: scoreFn(t), tb: tiebreakerFn ? tiebreakerFn(t) : null }))
    .filter((x): x is { i: number; s: number; tb: number | null } => x.s !== null)
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s;
      if (!tiebreakerFn || a.tb === b.tb) return 0;
      if (a.tb === null) return 1;
      if (b.tb === null) return -1;
      return b.tb - a.tb;
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

/**
 * Top-10 leaderboard. Scores are rounded, ranked with the same rule and tie-breaker as the results table, and groups
 * that still share a rank are listed by name. index.html (1153-1175) ignored the overall score here.
 */
export function leaderboard<T extends { id: string; name: string }>(
  items: T[],
  scoreFn: (t: T) => number | null,
  tiebreakerFn?: (t: T) => number | null,
  limit = 10,
): LeaderboardEntry[] {
  const rounded = (x: number | null) => (x === null ? null : round2(x));
  const rank = rankMap(items, (t) => rounded(scoreFn(t)), tiebreakerFn ? (t) => rounded(tiebreakerFn(t)) : undefined);
  return items
    .map((t, i) => ({ id: t.id, name: t.name, score: rounded(scoreFn(t)), rank: rank(i) }))
    .filter((x): x is LeaderboardEntry => x.score !== null && x.rank !== null)
    .sort((a, b) => a.rank - b.rank || byName(a.name, b.name))
    .slice(0, limit);
}

// ── members and grades ──────────────────────────────────────────────

export interface MemberResult {
  /** Out of the member fields' full total (100); null until every field has a score. */
  total: number | null;
  /** Every field has at least one judge's score. */
  complete: boolean;
}

/**
 * A member's total: for each field, the average across the judges who filled it in; then those averages added up.
 * Until every field has at least one score there is no total (a dash), never a partial sum scaled up to 100.
 * index.html (808-820) added up each judge's fields with that judge's blanks counted as zero, then averaged.
 */
export function memberScore(sets: MemberSet[], fields: MemberField[] = DEFAULT_RUBRIC.memberFields): MemberResult {
  let sum = 0;
  for (const f of fields) {
    const vals = sets.map((s) => s[f.key]).filter(has);
    if (!vals.length) return { total: null, complete: false };
    sum += vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return { total: sum, complete: true };
}

export const memberTotal = (sets: MemberSet[], fields?: MemberField[]) => memberScore(sets, fields).total;

/**
 * Final grade = (member total + group overall %) / 2 (index.html:1254), from the two-decimal values shown on screen
 * and in the workbook (decision 2), so the numbers people see always explain the rounded-up grade and its letter.
 */
export function finalGrade(total: number | null, overall: number | null): number | null {
  return total === null || overall === null ? null : (round2(total) + round2(overall)) / 2;
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

// ── whole-event results ─────────────────────────────────────────────

export interface CategoryResult {
  half: Half;
  key: string;
  name: string;
  pct: number | null;
  complete: boolean;
  rank: number | null;
}

export interface GroupResult {
  id: string;
  name: string;
  categories: CategoryResult[];
  defense: number | null;
  booth: number | null;
  defenseComplete: boolean;
  boothComplete: boolean;
  overall: number | null;
  /** Every criterion in both halves has at least one judge's score. */
  complete: boolean;
  /** Not complete, but the coordinator finalised it anyway with a reason; it is ranked on what it has. */
  accepted: boolean;
  overallRank: number | null;
}

export interface EventResults {
  groups: GroupResult[];
  leaderboards: { key: string; name: string; half: Half | 'overall'; entries: LeaderboardEntry[] }[];
}

/** The overall a group is ranked on, rounded; null when the group is incomplete and not accepted. */
export const rankableOverall = (g: GroupResult) => (g.overall !== null && (g.complete || g.accepted) ? round2(g.overall) : null);

const rankableCategory = (g: GroupResult, ci: number) => {
  const c = g.categories[ci];
  return c.pct !== null && (c.complete || g.accepted) ? round2(c.pct) : null;
};

export interface AdviserStanding {
  /** Average of the overall percentages of the adviser's ranked groups, rounded to two decimals. */
  average: number;
  rank: number;
  /** How many advisers were ranked. */
  of: number;
  groups: number;
}

export const TOP_PLACES = 10;

/**
 * What a student's or adviser's private page may say about a group's placing: the categories, then "Overall", in
 * which it placed in the top 10, never which place. Places are revealed at the awarding, so no number is shown there.
 */
export function topTenPlacings(result: GroupResult): string[] {
  const inTop = (rank: number | null) => rank !== null && rank <= TOP_PLACES;
  return [...result.categories.filter((c) => inTop(c.rank)).map((c) => c.name), ...(inTop(result.overallRank) ? ['Overall'] : [])];
}

/**
 * The adviser ranking (decision 10): the average of the overall percentages people see for the groups an adviser
 * advises, ranked highest first, tied advisers sharing a position. Only groups that are ranked count, so an
 * incomplete group neither helps nor hurts its adviser; an adviser with no ranked group has no position.
 */
export function adviserRanking(groups: { adviserId: string | null; result: GroupResult }[]): Map<string, AdviserStanding> {
  const byAdviser = new Map<string, number[]>();
  for (const { adviserId, result } of groups) {
    const ov = rankableOverall(result);
    if (!adviserId || ov === null) continue;
    byAdviser.set(adviserId, [...(byAdviser.get(adviserId) ?? []), ov]);
  }
  const rows = [...byAdviser.entries()].map(([id, list]) => ({ id, average: round2(list.reduce((a, b) => a + b, 0) / list.length), groups: list.length }));
  const rank = rankMap(rows, (r) => r.average);
  return new Map(rows.map((r, i) => [r.id, { average: r.average, rank: rank(i)!, of: rows.length, groups: r.groups }]));
}

/**
 * Percentages, completeness and ranks for every group. Only complete scores are ranked: an incomplete category or
 * group has no rank and reads as incomplete, unless the coordinator accepted the group at finalising.
 */
export function computeResults(rubric: Rubric, groups: ScoredGroup[]): EventResults {
  const base: GroupResult[] = groups.map((g) => {
    const d = halfScore(g.defense, rubric.halves.defense.categories);
    const b = halfScore(g.booth, rubric.halves.booth.categories);
    const categories = HALVES.flatMap((half) =>
      rubric.halves[half].categories.map((c) => {
        const s = categoryScore(half === 'defense' ? g.defense : g.booth, c);
        return { half, key: c.key, name: c.name, pct: s.pct, complete: s.complete, rank: null as number | null };
      }),
    );
    const complete = d.complete && b.complete;
    return {
      id: g.id,
      name: g.name,
      categories,
      defense: d.pct,
      booth: b.pct,
      defenseComplete: d.complete,
      boothComplete: b.complete,
      overall: overallPct(d.pct, b.pct, rubric),
      complete,
      accepted: !complete && !!g.accepted,
      overallRank: null as number | null,
    };
  });

  const catCount = base[0]?.categories.length ?? 0;
  for (let ci = 0; ci < catCount; ci++) {
    const rank = rankMap(base, (g) => rankableCategory(g, ci), rankableOverall);
    base.forEach((g, gi) => (g.categories[ci].rank = rank(gi)));
  }
  const ovRank = rankMap(base, rankableOverall);
  base.forEach((g, gi) => (g.overallRank = ovRank(gi)));

  // The leaderboard shows the same ranks as the table, top 10 by rank, ties listed by name.
  const board = (key: string, name: string, half: Half | 'overall', rankOf: (g: GroupResult) => number | null, scoreOf: (g: GroupResult) => number | null) => ({
    key,
    name,
    half,
    entries: base
      .map((g) => ({ id: g.id, name: g.name, score: scoreOf(g), rank: rankOf(g) }))
      .filter((e): e is LeaderboardEntry => e.rank !== null && e.score !== null)
      .sort((a, b) => a.rank - b.rank || byName(a.name, b.name))
      .slice(0, TOP_PLACES),
  });
  const leaderboards: EventResults['leaderboards'] = [];
  let ci = 0;
  for (const half of HALVES) {
    for (const c of rubric.halves[half].categories) {
      const i = ci++;
      leaderboards.push(board(c.key, c.name, half, (g) => g.categories[i].rank, (g) => rankableCategory(g, i)));
    }
  }
  leaderboards.push(board('overall', 'Overall', 'overall', (g) => g.overallRank, rankableOverall));

  return { groups: base, leaderboards };
}

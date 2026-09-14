// Judge profiles (item 14): how each judge's scores compare with the other judges who scored the same group in the
// same half. A basis for knowing the panel, not for removing anyone: every measure describes, none prescribes.
// Pure functions only, so the numbers can be tested; the coordinator's pages call them.
//
// For one judge, one half and one group, "the same criteria" are the criteria this judge scored that at least one
// co-judge also scored. Their score and the others' average are both worked out on exactly those criteria, the same
// way results are (categories averaged, blanks left out), so a criterion one side skipped cannot open a gap.

import { round2, halfPct, type SheetValues } from './scoring';
import type { Category, Half, Rubric } from './rubric';

/** A score this many points (out of 100) from every co-judge's is flagged as far from them. */
export const FAR_POINTS = 6;
/** Spread and agreement need at least this many compared groups. */
export const MIN_GROUPS = 3;

export interface ProfileSheet {
  judgeId: string;
  judgeName: string;
  groupId: string;
  groupCode: string;
  groupName: string;
  half: Half;
  values: SheetValues;
}

export type Level = 'narrow' | 'normal' | 'wide';
export type Agreement = 'high' | 'medium' | 'low';

export interface GroupComparison {
  groupId: string;
  groupCode: string;
  groupName: string;
  their: number;
  others: number;
  gap: number;
  /** Each co-judge's own score on the same criteria. */
  coScores: { judgeName: string; score: number }[];
  /** Position of this group among the judge's compared groups: by their score, and by the others' average. */
  theirOrder: number;
  panelOrder: number;
  flags: string[];
}

export interface HalfProfile {
  half: Half;
  /** Groups this judge put any score on in this half. */
  groupsScored: number;
  rows: GroupComparison[];
  /** Flags on groups with no co-judge to compare against (blanks and repeated marks still show). */
  uncompared: { groupId: string; groupCode: string; groupName: string; flags: string[] }[];
  marksAt: number | null;
  spread: { sd: number; ratio: number | null; level: Level | null; low: number; high: number; middleLow: number; middleHigh: number } | null;
  agreement: { rho: number; level: Agreement } | null;
}

export interface JudgeProfile {
  judgeId: string;
  judgeName: string;
  halves: Record<Half, HalfProfile>;
  groups: number;
  marksAt: number | null;
  separation: Level | null;
  spreadRange: { low: number; high: number } | null;
  agreement: Agreement | null;
  summary: string;
}

const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
};

/** Average ranks, 1 = highest, ties sharing the average of their positions (as rank correlation needs). */
function averageRanks(xs: number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x);
  const ranks = new Array<number>(xs.length);
  for (let p = 0; p < order.length; ) {
    let q = p;
    while (q + 1 < order.length && order[q + 1].x === order[p].x) q++;
    const avg = (p + q) / 2 + 1;
    for (let k = p; k <= q; k++) ranks[order[k].i] = avg;
    p = q + 1;
  }
  return ranks;
}

/** Spearman rank correlation: 1 = the same order, 0 = unrelated, −1 = reversed. Null when either side has no variation. */
export function rankCorrelation(a: number[], b: number[]): number | null {
  if (a.length < 2) return null;
  const ra = averageRanks(a);
  const rb = averageRanks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

export const agreementLevel = (rho: number): Agreement => (rho >= 0.7 ? 'high' : rho >= 0.4 ? 'medium' : 'low');
export const spreadLevel = (ratio: number): Level => (ratio < 0.75 ? 'narrow' : ratio > 1.33 ? 'wide' : 'normal');

/** Competition order (1, 1, 3) on rounded scores, as shown in the table. */
function orderOf(xs: number[]): number[] {
  const r = xs.map(round2);
  return r.map((x) => 1 + r.filter((y) => y > x).length);
}

/** Keeps only the listed criteria of a sheet; everything else becomes blank. */
function masked(values: SheetValues, cats: Category[], keep: Set<string>): SheetValues {
  return Object.fromEntries(cats.map((c) => [c.key, c.maxes.map((_, i) => (keep.has(`${c.key}:${i}`) ? (values[c.key]?.[i] ?? null) : null))]));
}

const filledKeys = (values: SheetValues, cats: Category[]) =>
  new Set(cats.flatMap((c) => c.maxes.map((_, i) => (has(values[c.key]?.[i]) ? `${c.key}:${i}` : null)).filter((k): k is string => k !== null)));

/** Patterns on one sheet worth a look: the same mark down a whole category, and criteria left blank. */
export function sheetFlags(values: SheetValues, cats: Category[]): string[] {
  const flags: string[] = [];
  for (const c of cats) {
    const vals = c.maxes.map((_, i) => values[c.key]?.[i]);
    if (c.maxes.length >= 3 && vals.every(has) && vals.every((v) => v === vals[0])) {
      flags.push(`${vals[0]} entered down all ${c.maxes.length} criteria of ${c.name}`);
    }
  }
  const blanks = cats.reduce((n, c) => n + c.maxes.filter((_, i) => !has(values[c.key]?.[i])).length, 0);
  if (blanks) flags.push(`${blanks} criteri${blanks === 1 ? 'on' : 'a'} left blank`);
  return flags;
}

function halfProfile(judgeId: string, half: Half, sheets: ProfileSheet[], rubric: Rubric): HalfProfile {
  const cats = rubric.halves[half].categories;
  const inHalf = sheets.filter((s) => s.half === half && filledKeys(s.values, cats).size > 0);
  const mine = inHalf.filter((s) => s.judgeId === judgeId);
  const rows: GroupComparison[] = [];
  const uncompared: HalfProfile['uncompared'] = [];

  for (const s of mine) {
    const co = inHalf.filter((x) => x.groupId === s.groupId && x.judgeId !== judgeId);
    const myKeys = filledKeys(s.values, cats);
    const coKeys = new Set(co.flatMap((x) => [...filledKeys(x.values, cats)]));
    const same = new Set([...myKeys].filter((k) => coKeys.has(k)));
    const flags = sheetFlags(s.values, cats);
    if (!same.size) {
      uncompared.push({ groupId: s.groupId, groupCode: s.groupCode, groupName: s.groupName, flags });
      continue;
    }
    const their = halfPct([masked(s.values, cats, same)], cats)!;
    const others = halfPct(co.map((x) => masked(x.values, cats, same)), cats)!;
    const coScores = co
      .map((x) => ({ judgeName: x.judgeName, score: halfPct([masked(x.values, cats, same)], cats) }))
      .filter((x): x is { judgeName: string; score: number } => x.score !== null);
    if (coScores.length && coScores.every((c) => Math.abs(their - c.score) >= FAR_POINTS)) {
      const list = coScores.map((c) => round2(c.score).toFixed(2)).join(', ');
      flags.unshift(`Far from ${coScores.length === 1 ? 'the co-judge' : coScores.length === 2 ? 'both co-judges' : 'all co-judges'} (${list})`);
    }
    rows.push({ groupId: s.groupId, groupCode: s.groupCode, groupName: s.groupName, their, others, gap: their - others, coScores, theirOrder: 0, panelOrder: 0, flags });
  }

  rows.sort((a, b) => a.groupCode.localeCompare(b.groupCode, undefined, { numeric: true }));
  const theirOrder = orderOf(rows.map((r) => r.their));
  const panelOrder = orderOf(rows.map((r) => r.others));
  rows.forEach((r, i) => {
    r.theirOrder = theirOrder[i];
    r.panelOrder = panelOrder[i];
  });

  let spread: HalfProfile['spread'] = null;
  let agreement: HalfProfile['agreement'] = null;
  if (rows.length >= MIN_GROUPS) {
    const scores = rows.map((r) => r.their);
    const mySd = sd(scores);
    // The panel's own spread: each other judge's spread on the groups they share with this judge.
    const mineIds = new Set(rows.map((r) => r.groupId));
    const otherJudges = [...new Set(inHalf.filter((x) => x.judgeId !== judgeId).map((x) => x.judgeId))];
    const otherSds = otherJudges
      .map((k) => halfProfileScores(k, half, inHalf, rubric).filter((r) => mineIds.has(r.groupId)).map((r) => r.their))
      .filter((xs) => xs.length >= MIN_GROUPS)
      .map(sd);
    const panelSd = otherSds.length ? mean(otherSds) : null;
    const ratio = panelSd ? mySd / panelSd : null;
    const sorted = [...scores].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
    spread = { sd: mySd, ratio, level: ratio === null ? null : spreadLevel(ratio), low: sorted[0], high: sorted[sorted.length - 1], middleLow: q(0.25), middleHigh: q(0.75) };
    const rho = rankCorrelation(scores, rows.map((r) => r.others));
    agreement = rho === null ? null : { rho, level: agreementLevel(rho) };
  }

  return {
    half,
    groupsScored: new Set(mine.map((s) => s.groupId)).size,
    rows,
    uncompared,
    marksAt: rows.length ? mean(rows.map((r) => r.gap)) : null,
    spread,
    agreement,
  };
}

/** Just another judge's compared scores, for the panel's spread (no flags, no nesting). */
function halfProfileScores(judgeId: string, half: Half, inHalf: ProfileSheet[], rubric: Rubric) {
  const cats = rubric.halves[half].categories;
  return inHalf
    .filter((s) => s.judgeId === judgeId)
    .map((s) => {
      const co = inHalf.filter((x) => x.groupId === s.groupId && x.judgeId !== judgeId);
      const coKeys = new Set(co.flatMap((x) => [...filledKeys(x.values, cats)]));
      const same = new Set([...filledKeys(s.values, cats)].filter((k) => coKeys.has(k)));
      return { groupId: s.groupId, their: same.size ? halfPct([masked(s.values, cats, same)], cats) : null };
    })
    .filter((r): r is { groupId: string; their: number } => r.their !== null);
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const inWords = (n: number) => WORDS[n] ?? String(n);

/** One plain sentence describing a judge, in the coordinator's tone: what they do, never what to do about it. */
export function describe(p: { marksAt: number | null; separation: Level | null; middle?: { low: number; high: number } | null; agreement: Agreement | null }): string {
  const parts: string[] = [];
  if (p.marksAt === null) return 'No co-judge scored the same groups, so there is nothing to compare yet.';
  const pts = Math.round(Math.abs(p.marksAt));
  parts.push(pts === 0 ? 'Scores in line with the panel' : `Scores about ${inWords(pts)} point${pts === 1 ? '' : 's'} ${p.marksAt > 0 ? 'above' : 'below'} the panel`);
  if (p.separation === 'wide') parts.push('spreads groups further apart than the others do');
  else if (p.separation === 'narrow') parts.push(p.middle ? `gives most groups between ${Math.round(p.middle.low)} and ${Math.round(p.middle.high)}` : 'keeps groups closer together than the others do');
  else if (p.separation === 'normal') parts.push('spreads groups about as the others do');
  if (p.agreement === 'high') parts.push('ranks them much as the panel does');
  else if (p.agreement === 'medium') parts.push('ranks them partly as the panel does');
  else if (p.agreement === 'low') parts.push('orders them differently from the panel');
  if (parts.length === 1) return `${parts[0]}.`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}

/** A judge's profile for one event, both halves and pooled. */
export function judgeProfile(judgeId: string, judgeName: string, sheets: ProfileSheet[], rubric: Rubric): JudgeProfile {
  const halves = { defense: halfProfile(judgeId, 'defense', sheets, rubric), booth: halfProfile(judgeId, 'booth', sheets, rubric) };
  const both = [halves.defense, halves.booth];
  const gaps = both.flatMap((h) => h.rows.map((r) => r.gap));
  // Pooled over the halves, weighted by how many groups each half compared.
  const weighted = (pick: (h: HalfProfile) => number | null | undefined) => {
    const xs = both.map((h) => ({ v: pick(h), w: h.rows.length })).filter((x): x is { v: number; w: number } => has(x.v));
    const w = xs.reduce((a, x) => a + x.w, 0);
    return w ? xs.reduce((a, x) => a + x.v * x.w, 0) / w : null;
  };
  const ratio = weighted((h) => h.spread?.ratio);
  const rho = weighted((h) => h.agreement?.rho);
  const withSpread = both.filter((h) => h.spread);
  const scores = both.flatMap((h) => h.rows.map((r) => r.their)).sort((a, b) => a - b);
  const main = [...withSpread].sort((a, b) => b.rows.length - a.rows.length)[0]?.spread ?? null;
  const separation = ratio === null ? null : spreadLevel(ratio);
  const agreement = rho === null ? null : agreementLevel(rho);
  const marksAt = gaps.length ? mean(gaps) : null;
  return {
    judgeId,
    judgeName,
    halves,
    groups: new Set(sheets.filter((s) => s.judgeId === judgeId && filledKeys(s.values, rubric.halves[s.half].categories).size).map((s) => s.groupId)).size,
    marksAt,
    separation,
    spreadRange: scores.length ? { low: scores[0], high: scores[scores.length - 1] } : null,
    agreement,
    summary: describe({ marksAt, separation, middle: main ? { low: main.middleLow, high: main.middleHigh } : null, agreement }),
  };
}

/** The same judge's profile for one half only, with its own sentence (for the detail page). */
export function halfSummary(h: HalfProfile): string {
  return describe({
    marksAt: h.marksAt,
    separation: h.spread?.level ?? null,
    middle: h.spread ? { low: h.spread.middleLow, high: h.spread.middleHigh } : null,
    agreement: h.agreement?.level ?? null,
  });
}

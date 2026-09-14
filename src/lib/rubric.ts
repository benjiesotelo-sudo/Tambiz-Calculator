// The scoring sheet definition. Every event stores its own copy of this object (event.rubric),
// so changing the default for next year never rewrites an old event.
// Maximums are copied from DEFENSE_CATS / BOOTH_CATS and the member fields in index.html (lines 593-604, 1245-1249).

export type Half = 'defense' | 'booth';
export const HALVES: Half[] = ['defense', 'booth'];

export interface Category {
  key: string;
  name: string;
  maxes: number[];
  /** Wording for each criterion. Optional: "Criterion n" is shown when missing. */
  criteria?: string[];
}

export interface HalfDef {
  label: string;
  weight: number;
  categories: Category[];
}

export type MemberFieldKey = 'presentation' | 'communication' | 'qa';

export interface MemberField {
  key: MemberFieldKey;
  name: string;
  max: number;
}

export interface GradeBand {
  min: number;
  max: number;
  letter: string;
  qualityPoints: number;
}

export interface Rubric {
  version: 1;
  halves: Record<Half, HalfDef>;
  memberFields: MemberField[];
  grades: GradeBand[];
}

export const DEFAULT_RUBRIC: Rubric = {
  version: 1,
  halves: {
    defense: {
      label: 'Defense',
      weight: 0.7,
      categories: [
        { key: 'ep', name: 'Elevator Pitch', maxes: [20, 20, 20, 20, 20] },
        { key: 'inf', name: 'Infomercial', maxes: [10, 10, 10, 10] },
        { key: 'paper', name: 'Paper', maxes: [5, 20, 10, 10, 10, 10, 10, 10, 15] },
        { key: 'pd', name: 'Product Demo', maxes: [25, 25, 50] },
      ],
    },
    booth: {
      label: 'Booth',
      weight: 0.3,
      categories: [
        { key: 'bbpb', name: 'Best Business Plan Booth', maxes: [20, 20, 10, 10, 10, 10, 10, 10] },
        { key: 'si', name: 'Student Innovation', maxes: [20, 30, 30, 20] },
        { key: 'bpd', name: 'Best Product Demonstration', maxes: [30, 30, 20, 5, 10, 5] },
      ],
    },
  },
  memberFields: [
    { key: 'presentation', name: 'Presentation', max: 20 },
    { key: 'communication', name: 'Communication', max: 40 },
    { key: 'qa', name: 'Q&A', max: 40 },
  ],
  grades: [
    { min: 92, max: 100, letter: 'A', qualityPoints: 4 },
    { min: 85, max: 91, letter: 'B+', qualityPoints: 3.5 },
    { min: 78, max: 84, letter: 'B', qualityPoints: 3 },
    { min: 71, max: 77, letter: 'C+', qualityPoints: 2.5 },
    { min: 64, max: 70, letter: 'C', qualityPoints: 2 },
    { min: 57, max: 63, letter: 'D+', qualityPoints: 1.5 },
    { min: 50, max: 56, letter: 'D', qualityPoints: 1 },
    { min: 0, max: 49, letter: 'F', qualityPoints: 0 },
  ],
};

/** Misspellings corrected when a new event copies an older scoring sheet (decision 12). */
const CORRECTED_NAMES: Record<string, string> = { Informercial: 'Infomercial' };

/**
 * The scoring sheet for a new event: a copy of the newest event's (or the default), with known misspellings
 * corrected. Events already stored are never touched, so they keep the spelling they were judged under.
 */
export function rubricForNewEvent(latest?: Rubric | null): Rubric {
  const next: Rubric = structuredClone(latest ?? DEFAULT_RUBRIC);
  for (const half of HALVES) for (const c of next.halves[half].categories) c.name = CORRECTED_NAMES[c.name] ?? c.name;
  return next;
}

export const categoryMax = (c: Category) => c.maxes.reduce((a, b) => a + b, 0);

export const criterionKey = (catKey: string, index: number) => `${catKey}:${index}`;

export function criterionLabel(c: Category, i: number) {
  return c.criteria?.[i] || `Criterion ${i + 1}`;
}

/** Longest criterion wording kept; anything longer is cut. */
export const MAX_WORDING = 400;

/** Form field name for one criterion's wording on the Scoring sheet screen. */
export const wordingField = (half: Half, catKey: string, i: number) => `crit:${half}:${catKey}:${i}`;

/**
 * A copy of the rubric with new criterion wording. `get` returns the typed text for a field, or null when the form
 * did not send that field, in which case the stored wording is kept. Only wording changes; points never do.
 */
export function withCriterionWording(rubric: Rubric, get: (field: string) => string | null): { rubric: Rubric; worded: number } {
  const next: Rubric = structuredClone(rubric);
  let worded = 0;
  for (const half of HALVES) {
    for (const cat of next.halves[half].categories) {
      cat.criteria = cat.maxes.map((_, i) => {
        const typed = get(wordingField(half, cat.key, i));
        const text = typed === null ? (cat.criteria?.[i] ?? '') : typed.replace(/\s+/g, ' ').trim().slice(0, MAX_WORDING);
        if (text) worded++;
        return text;
      });
    }
  }
  return { rubric: next, worded };
}

/** Lines pasted from Word or Excel, one criterion per line, with list numbering and bullets removed. */
export function splitPastedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\(?\d{1,2}[.):]|[-•*–])\s+/, '').replace(/\t+/g, ' ').trim())
    .filter(Boolean);
}

/** Every criterion in a half, in sheet order, with its storage key and maximum. */
export function criteriaOf(rubric: Rubric, half: Half) {
  return rubric.halves[half].categories.flatMap((c) =>
    c.maxes.map((max, i) => ({ key: criterionKey(c.key, i), category: c, index: i, max })),
  );
}

export function findCriterion(rubric: Rubric, half: Half, key: string) {
  return criteriaOf(rubric, half).find((c) => c.key === key) ?? null;
}

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
        { key: 'inf', name: 'Informercial', maxes: [10, 10, 10, 10] },
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

export const categoryMax = (c: Category) => c.maxes.reduce((a, b) => a + b, 0);

export const criterionKey = (catKey: string, index: number) => `${catKey}:${index}`;

export function criterionLabel(c: Category, i: number) {
  return c.criteria?.[i] || `Criterion ${i + 1}`;
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

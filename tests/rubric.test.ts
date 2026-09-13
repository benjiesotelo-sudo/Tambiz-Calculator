// Criterion wording typed or pasted on the Scoring sheet screen.
import { describe, expect, it } from 'vitest';
import { criterionLabel, DEFAULT_RUBRIC, MAX_WORDING, rubricForNewEvent, splitPastedLines, withCriterionWording, wordingField, type Rubric } from '@/lib/rubric';

describe('"Informercial" becomes "Infomercial" for new events only (decision 12)', () => {
  it('the default scoring sheet spells it Infomercial', () => {
    expect(DEFAULT_RUBRIC.halves.defense.categories[1].name).toBe('Infomercial');
  });

  it('a new event copied from a stored event that says Informercial is corrected, keeping points and wording', () => {
    const stored: Rubric = structuredClone(DEFAULT_RUBRIC);
    stored.halves.defense.categories[1].name = 'Informercial';
    stored.halves.defense.categories[1].criteria = ['Script', '', '', ''];
    const next = rubricForNewEvent(stored);
    expect(next.halves.defense.categories[1]).toMatchObject({ key: 'inf', name: 'Infomercial', maxes: [10, 10, 10, 10], criteria: ['Script', '', '', ''] });
    // The stored event keeps the spelling it was judged under.
    expect(stored.halves.defense.categories[1].name).toBe('Informercial');
  });

  it('with no earlier event, the default is used', () => expect(rubricForNewEvent(null)).toEqual(DEFAULT_RUBRIC));
});

describe('criterion wording', () => {
  it('judges see "Criterion n" until wording is entered', () => {
    expect(criterionLabel(DEFAULT_RUBRIC.halves.defense.categories[0], 2)).toBe('Criterion 3');
  });

  it('saves typed wording against the right criterion, and never touches the points', () => {
    const fields: Record<string, string> = {
      [wordingField('defense', 'ep', 0)]: '  Clear   problem statement ',
      [wordingField('booth', 'bpd', 5)]: 'Answers questions',
    };
    const { rubric, worded } = withCriterionWording(DEFAULT_RUBRIC, (f) => fields[f] ?? '');
    expect(worded).toBe(2);
    expect(criterionLabel(rubric.halves.defense.categories[0], 0)).toBe('Clear problem statement');
    expect(criterionLabel(rubric.halves.booth.categories[2], 5)).toBe('Answers questions');
    expect(criterionLabel(rubric.halves.defense.categories[0], 1)).toBe('Criterion 2');
    expect(JSON.stringify(rubric.halves.defense.categories.map((c) => c.maxes))).toBe(JSON.stringify(DEFAULT_RUBRIC.halves.defense.categories.map((c) => c.maxes)));
    expect(DEFAULT_RUBRIC.halves.defense.categories[0].criteria).toBeUndefined();
  });

  it('keeps stored wording for any field the form did not send', () => {
    const first = withCriterionWording(DEFAULT_RUBRIC, (f) => (f === wordingField('defense', 'pd', 2) ? 'Working prototype' : '')).rubric;
    const second = withCriterionWording(first, () => null).rubric;
    expect(criterionLabel(second.halves.defense.categories[3], 2)).toBe('Working prototype');
  });

  it('cuts very long wording', () => {
    const { rubric } = withCriterionWording(DEFAULT_RUBRIC, (f) => (f === wordingField('defense', 'ep', 0) ? 'x'.repeat(1000) : ''));
    expect(rubric.halves.defense.categories[0].criteria![0]).toHaveLength(MAX_WORDING);
  });

  it('splits a pasted list into one criterion per line, dropping numbering, bullets and empty lines', () => {
    expect(splitPastedLines('1. Hook\r\n2) Problem\n\n• Solution\n- Market size\n(5) Team\nAsk')).toEqual(['Hook', 'Problem', 'Solution', 'Market size', 'Team', 'Ask']);
  });
});

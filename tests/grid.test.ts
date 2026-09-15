// The spreadsheet table's logic that needs no browser: Excel's clipboard, matching typed values, search, sort, paste.
import { describe, expect, it } from 'vitest';
import {
  columnTracks,
  completionMatches,
  filterRows,
  filterValues,
  leaveCompletion,
  matchOption,
  parseClipboard,
  plainCompletion,
  planPaste,
  resolveCell,
  resolveCompletion,
  sortRows,
  stepCompletion,
  toClipboard,
  typeCompletion,
  type Completion,
  type GridColumn,
  type GridOption,
  type GridRow,
} from '@/lib/grid';

const advisers = [
  { value: 'a1', label: 'Prof. Maria Santos', hint: 'msantos@feu.edu.ph' },
  { value: 'a2', label: 'Prof. Ramon Villareal' },
  { value: 'a3', label: 'Prof. Teresita Uy' },
];
const columns: GridColumn[] = [
  { key: 'code', label: 'Code', editable: true },
  { key: 'name', label: 'Business name', editable: true, required: true },
  { key: 'adviser', label: 'Adviser', type: 'choice', editable: true, options: advisers },
  { key: 'members', label: 'Members', type: 'number' },
];
const rows: GridRow[] = [
  { id: 'g1', cells: { code: 'G01', name: 'Kape Kultura', adviser: 'Prof. Maria Santos', members: '6' } },
  { id: 'g2', cells: { code: 'G02', name: 'Banig & Co.', adviser: '', members: '10' } },
  { id: 'g3', cells: { code: 'G10', name: 'Bayong Bags', adviser: 'Prof. Teresita Uy', members: '' } },
];

describe('reading what Excel puts on the clipboard', () => {
  it('tabs separate cells and new lines separate rows; the trailing new line adds nothing', () => {
    expect(parseClipboard('G01\tKape Kultura\r\nG02\tBanig & Co.\r\n')).toEqual([
      ['G01', 'Kape Kultura'],
      ['G02', 'Banig & Co.'],
    ]);
  });
  it('a quoted cell may hold tabs, new lines and doubled quotes', () => {
    expect(parseClipboard('"Line one\nline two"\t"He said ""hi"""\n')).toEqual([['Line one\nline two', 'He said "hi"']]);
  });
  it('copying out of the table quotes such cells so Excel reads them back the same', () => {
    const cells = [['a\tb', 'plain'], ['say "x"', '']];
    expect(parseClipboard(toClipboard(cells))).toEqual(cells);
  });
});

describe('matching a typed value to a list', () => {
  it('an exact label, a unique part of a label or hint, or nothing', () => {
    expect(matchOption('prof. teresita uy', advisers)).toMatchObject({ value: 'a3' });
    expect(matchOption('villareal', advisers)).toMatchObject({ value: 'a2' });
    expect(matchOption('msantos@', advisers)).toMatchObject({ value: 'a1' });
    expect(matchOption('Prof', advisers)).toBe('ambiguous');
    expect(matchOption('Dr. Nobody', advisers)).toBeNull();
  });
  it('a choice not on the list is refused unless the column takes new values', () => {
    expect(resolveCell(columns[2], 'Dr. Nobody')).toEqual({ error: '“Dr. Nobody” is not on the list for Adviser.' });
    expect(resolveCell({ ...columns[2], allowNew: true }, 'Dr. Nobody')).toEqual({ value: 'Dr. Nobody', label: 'Dr. Nobody' });
    expect(resolveCell(columns[2], '')).toEqual({ value: '', label: '' });
  });
  it('a score above its maximum is refused with the same message as the judge’s phone, never clamped', () => {
    const score: GridColumn = { key: 's', label: 'Score', editable: true, type: 'number', max: 20 };
    expect(resolveCell(score, '25')).toEqual({ error: 'Max is 20. You typed 25, so it is not counted yet.' });
    expect(resolveCell(score, '17.50')).toEqual({ value: '17.5', label: '17.5' });
    expect(resolveCell(score, '0')).toEqual({ value: '0', label: '0' });
  });
});

describe('completing a typed choice in the cell, as Excel does', () => {
  /** What the cell shows, with the highlighted completion in brackets: what the person sees before pressing a key. */
  const shown = (c: Completion) => `${c.text.slice(0, c.start)}[${c.text.slice(c.start, c.end)}]${c.text.slice(c.end)}`;

  // The Members table's Student No. column: students in no group, several sharing a surname.
  const unplaced: GridOption[] = [
    { value: 's1', label: '2021-00101', hint: 'REYES, Ana · BSA-1A' },
    { value: 's2', label: '2021-00102', hint: 'REYES, Ben · BSA-1A' },
    { value: 's3', label: '2021-00103', hint: 'SANTOS, Carla · BSA-1B' },
    { value: 's4', label: '2021-00104', hint: 'REYES, Dan · BSA-1B' },
  ];
  const studentNo: GridColumn = { key: 'student', label: 'Student No.', type: 'choice', editable: true, addOnly: true, required: true, allowNew: true, uniqueOptions: true, options: unplaced };

  it('a surname shared by several students shows one of them in the cell, and Enter saves exactly that student', () => {
    const c = typeCompletion('reyes', unplaced, true);
    expect(shown(c)).toBe('reyes[ → 2021-00101 · REYES, Ana · BSA-1A]');
    expect(resolveCompletion(studentNo, c)).toEqual({ value: 's1', label: '2021-00101' });
  });

  it('Down shows the next student with that surname in the cell and Up goes back; each saves as shown', () => {
    const c = typeCompletion('reyes', unplaced, true);
    const matches = completionMatches(c.typed, unplaced);
    expect(matches.map((o) => o.value)).toEqual(['s1', 's2', 's4']);
    const second = stepCompletion(c, matches, 1);
    expect(shown(second)).toBe('reyes[ → 2021-00102 · REYES, Ben · BSA-1A]');
    expect(resolveCompletion(studentNo, second)).toEqual({ value: 's2', label: '2021-00102' });
    const third = stepCompletion(second, matches, 1);
    expect(shown(third)).toBe('reyes[ → 2021-00104 · REYES, Dan · BSA-1B]');
    expect(resolveCompletion(studentNo, third)).toEqual({ value: 's4', label: '2021-00104' });
    expect(stepCompletion(second, matches, -1)).toEqual({ ...c, chosen: true });
    expect(resolveCompletion(studentNo, stepCompletion(c, matches, -1))).toEqual({ value: 's4', label: '2021-00104' });
  });

  it('Esc or Backspace keeps only what was typed, which is refused as ambiguous and never saved as the first student', () => {
    const c = typeCompletion('reyes', unplaced, true);
    const kept = plainCompletion(c.typed);
    expect(shown(kept)).toBe('reyes[]');
    expect(resolveCompletion(studentNo, kept)).toEqual({ error: expect.stringContaining('“reyes” matches more than one') });
    // Backspace over the highlighted part leaves the typed text, and deleting further does not complete again.
    expect(typeCompletion('reyes', unplaced, false)).toEqual(kept);
    expect(shown(typeCompletion('reye', unplaced, false))).toBe('reye[]');
  });

  it('typing “reyes” and clicking away or switching to Excel adds no student; “reyes” stays typed and unsaved', () => {
    const c = typeCompletion('reyes', unplaced, true);
    expect(leaveCompletion(studentNo, c, true, unplaced)).toEqual({ keep: plainCompletion('reyes') });
    expect(leaveCompletion(studentNo, c, false, unplaced)).toEqual({ keep: plainCompletion('reyes'), reason: expect.stringContaining('“reyes” matches more than one') });
    const chosenWithDown = stepCompletion(c, completionMatches('reyes', unplaced), 1);
    expect(leaveCompletion(studentNo, chosenWithDown, false, unplaced)).toEqual({
      keep: chosenWithDown,
      reason: 'Student No.: not saved. Press Enter or Tab to save 2021-00102, or Esc to keep only what you typed.',
    });
  });

  it('clicking away saves only the one student the cell shows, and never while in another window', () => {
    const santos = typeCompletion('santos', unplaced, true);
    expect(shown(santos)).toBe('santos[ → 2021-00103 · SANTOS, Carla · BSA-1B]');
    const left = leaveCompletion(studentNo, santos, false, unplaced);
    expect(left).toEqual({ save: santos });
    expect('save' in left && resolveCompletion(studentNo, left.save)).toEqual({ value: 's3', label: '2021-00103' });
    // After Esc the cell shows only “santos”, not the student, so clicking away saves nothing.
    expect(leaveCompletion(studentNo, plainCompletion('santos'), false, unplaced)).toEqual({
      keep: plainCompletion('santos'),
      reason: 'Student No.: not saved, because the cell did not show “2021-00103”. Press Down to show it, then Enter.',
    });
    const exact = typeCompletion('2021-00104', unplaced, true);
    expect(leaveCompletion(studentNo, exact, false, unplaced)).toEqual({ save: exact });
    expect(leaveCompletion(studentNo, exact, true, unplaced)).toEqual({ keep: plainCompletion('2021-00104') });
    const score: GridColumn = { key: 's', label: 'Score', editable: true, type: 'number', max: 20 };
    expect(leaveCompletion(score, plainCompletion('18'), false)).toEqual({ save: plainCompletion('18') });
  });

  it('typing a whole student number completes to nothing more and saves that student', () => {
    const c = typeCompletion('2021-00103', unplaced, true);
    expect(shown(c)).toBe('2021-00103[]');
    expect(resolveCompletion(studentNo, c)).toEqual({ value: 's3', label: '2021-00103' });
  });

  it('a group picked with Down is saved by Enter; clicking away saves nothing and the cell still shows the choice Enter saves', () => {
    const groups: GridOption[] = ['G5', 'G50', 'G51', 'G52', 'G53', 'G54', 'G55', 'G56', 'G57'].map((code) => ({ value: code.toLowerCase(), label: code }));
    const group: GridColumn = { key: 'group', label: 'Group', type: 'choice', editable: true, options: groups };
    const g5 = typeCompletion('G5', groups, true);
    expect(shown(g5)).toBe('G5[]');
    const down = stepCompletion(g5, completionMatches('G5', groups), 1);
    expect(shown(down)).toBe('G5[0]');
    const leftDown = leaveCompletion(group, down, false, groups);
    expect(leftDown).toEqual({ keep: down, reason: 'Group: not saved. Press Enter or Tab to save G50, or Esc to keep only what you typed.' });
    // Back in the open cell, it shows G50 and Enter saves G50; Esc leaves only the typed G5.
    expect('keep' in leftDown && shown(leftDown.keep)).toBe('G5[0]');
    expect('keep' in leftDown && resolveCompletion(group, leftDown.keep)).toEqual({ value: 'g50', label: 'G50' });
    expect(leaveCompletion(group, down, true, groups)).toEqual({ keep: down });
    expect(shown(plainCompletion(down.typed))).toBe('G5[]');
    const left = leaveCompletion(group, g5, false, groups);
    expect(left).toEqual({ save: g5 });
    expect('save' in left && resolveCompletion(group, left.save)).toEqual({ value: 'g5', label: 'G5' });
  });

  it('a group code completes in place, and typing on replaces the highlighted part and narrows it', () => {
    const groups: GridOption[] = [
      { value: 'g05', label: 'G05' },
      { value: 'g50', label: 'G50' },
      { value: 'g51', label: 'G51' },
    ];
    const group: GridColumn = { key: 'group', label: 'Group', type: 'choice', editable: true, options: groups };
    const g5 = typeCompletion('g5', groups, true);
    expect(shown(g5)).toBe('G5[0]');
    expect(resolveCompletion(group, g5)).toEqual({ value: 'g50', label: 'G50' });
    const g51 = typeCompletion('G51', groups, true);
    expect(shown(g51)).toBe('G51[]');
    expect(resolveCompletion(group, g51)).toEqual({ value: 'g51', label: 'G51' });
    const none = typeCompletion('G99', groups, true);
    expect(shown(none)).toBe('G99[]');
    expect(resolveCompletion(group, none)).toEqual({ error: '“G99” is not on the list for Group.' });
  });

  it('an adviser completes by name, and a name on no list is kept as a new adviser where the column allows it', () => {
    const adviser = { ...columns[2], allowNew: true };
    const c = typeCompletion('Prof. R', advisers, true);
    expect(shown(c)).toBe('Prof. R[amon Villareal]');
    expect(resolveCompletion(adviser, c)).toEqual({ value: 'a2', label: 'Prof. Ramon Villareal' });
    expect(resolveCompletion(adviser, typeCompletion('Dr. Nobody', advisers, true))).toEqual({ value: 'Dr. Nobody', label: 'Dr. Nobody' });
  });
});

describe('column widths', () => {
  const rem = 16;
  /** The narrowest the browser lets each column be in a table this many pixels wide, read from the tracks. */
  const minimums = (tracks: string, width: number) =>
    [...tracks.matchAll(/minmax\(min\(([\d.]+)rem, ([\d.]+)%\), [^)]+\)/g)].map((m) => Math.min(Number(m[1]) * rem, (Number(m[2]) / 100) * width));
  // The Grades table's columns, the widest of the coordinator's tables.
  const widths = ['7.6rem', 'minmax(10rem, 1.8fr)', '5.6rem', 'minmax(8rem, 1.3fr)', 'minmax(7rem, 1fr)', '5.6rem', '5.6rem', '5.2rem', '5rem', '4.4rem', '3.6rem', '6.6rem', '6.8rem'];
  const grades: GridColumn[] = widths.map((width, i) => ({ key: `c${i}`, label: `Column ${i}`, width }));

  it('every column keeps its width where the table has room', () => {
    expect(minimums(columnTracks(grades), 2000)).toEqual([7.6, 10, 5.6, 8, 7, 5.6, 5.6, 5.2, 5, 4.4, 3.6, 6.6, 6.8].map((r) => r * rem));
  });

  it('on a laptop or tablet every column shrinks alike, so the whole table fits and none is cut off', () => {
    const tracks = columnTracks(grades);
    for (const width of [1288, 1000, 761]) {
      const mins = minimums(tracks, width);
      expect(mins).toHaveLength(grades.length);
      expect(mins.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(width);
    }
  });
});

describe('search, filters and sorting', () => {
  it('every word must appear somewhere in the row; filters match whole cells', () => {
    expect(filterRows(rows, columns, 'bags uy', {}).map((r) => r.id)).toEqual(['g3']);
    expect(filterRows(rows, columns, '', { adviser: '(blank)' }).map((r) => r.id)).toEqual(['g2']);
    expect(filterValues(rows, 'adviser')).toEqual(['Prof. Maria Santos', 'Prof. Teresita Uy', '(blank)']);
  });
  it('numbers sort as numbers and codes in natural order, with empty cells last both ways', () => {
    expect(sortRows(rows, columns[3], 'asc').map((r) => r.id)).toEqual(['g1', 'g2', 'g3']);
    expect(sortRows(rows, columns[3], 'desc').map((r) => r.id)).toEqual(['g2', 'g1', 'g3']);
    expect(sortRows(rows, columns[0], 'desc').map((r) => r.cells.code)).toEqual(['G10', 'G02', 'G01']);
    expect(sortRows(rows, columns[2], 'asc').map((r) => r.id)).toEqual(['g1', 'g3', 'g2']);
  });
});

describe('planning a paste from Excel', () => {
  const base = { rows, columns, canAdd: true, rowName: (r: GridRow) => r.cells.name };

  it('fills cells from the chosen one, lists only real changes, and adds rows past the end', () => {
    const plan = planPaste({ ...base, cells: parseClipboard('Kape Kultura\tSantos\nBanig and Co.\tUy\nNew Venture\tVillareal\n'), startRow: 0, startCol: 1 });
    expect(plan.changes).toEqual([
      { rowId: 'g2', key: 'name', from: 'Banig & Co.', to: 'Banig and Co.', value: 'Banig and Co.' },
      { rowId: 'g2', key: 'adviser', from: '', to: 'Prof. Teresita Uy', value: 'a3' },
      { rowId: 'g3', key: 'name', from: 'Bayong Bags', to: 'New Venture', value: 'New Venture' },
      { rowId: 'g3', key: 'adviser', from: 'Prof. Teresita Uy', to: 'Prof. Ramon Villareal', value: 'a2' },
    ]);
    expect(plan.newRows).toEqual([]);
    const more = planPaste({ ...base, cells: [['G11', 'New Venture']], startRow: 3, startCol: 0 });
    expect(more.newRows).toEqual([{ cells: { code: 'G11', name: 'New Venture' }, values: { code: 'G11', name: 'New Venture' } }]);
  });

  it('says what it could not use: a column that cannot change, a value not on the list, rows past the end', () => {
    const plan = planPaste({ ...base, canAdd: false, cells: parseClipboard('Nobody\t7\nUy\t8\nUy\t9\nUy\t1'), startRow: 0, startCol: 2 });
    expect(plan.changes).toEqual([{ rowId: 'g2', key: 'adviser', from: '', to: 'Prof. Teresita Uy', value: 'a3' }]);
    expect(plan.problems).toEqual([
      'Not changed here, so skipped: Members.',
      '1 pasted row went past the end of the table and was left out.',
      'Kape Kultura, Adviser: “Nobody” is not on the list for Adviser.',
    ]);
  });

  it('one value pasted over a selection fills every selected cell, as in Excel', () => {
    const plan = planPaste({ ...base, cells: [['Villareal']], startRow: 0, startCol: 2, selection: [0, 2, 2, 2] });
    expect(plan.changes.map((c) => [c.rowId, c.value])).toEqual([
      ['g1', 'a2'],
      ['g2', 'a2'],
      ['g3', 'a2'],
    ]);
  });

  it('a locked cell is skipped with its reason', () => {
    const locked = rows.map((r) => ({ ...r, locked: { code: 'Results have been released' } }));
    const plan = planPaste({ ...base, rows: locked, cells: [['G99']], startRow: 0, startCol: 0 });
    expect(plan.changes).toEqual([]);
    expect(plan.problems).toEqual(['Not changed here, so skipped: Code (Results have been released).']);
  });
});

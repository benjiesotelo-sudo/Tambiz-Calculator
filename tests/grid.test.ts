// The spreadsheet table's logic that needs no browser: Excel's clipboard, matching typed values, search, sort, paste.
import { describe, expect, it } from 'vitest';
import { filterRows, filterValues, matchOption, parseClipboard, planPaste, resolveCell, sortRows, toClipboard, type GridColumn, type GridRow } from '@/lib/grid';

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

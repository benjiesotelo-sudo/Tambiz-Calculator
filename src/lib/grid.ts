// The spreadsheet table every coordinator list uses (components/DataGrid.tsx): its types, and the logic that needs
// no browser (reading an Excel clipboard, matching a typed value to a list, searching, sorting, planning a paste),
// kept here so it can be tested. The server's table actions (app/admin/table-actions.ts) speak the same types.

import { checkScore, fmtScore } from './sheet';

export type CellTone = 'ok' | 'warn' | 'err' | 'muted' | 'corrected';

export interface GridOption {
  /** What is saved, for example an adviser's id. */
  value: string;
  /** What the cell shows and what people type, for example the adviser's name. */
  label: string;
  /** Extra words shown in the suggestions and matched when typing, for example a student's name and section. */
  hint?: string;
}

export interface GridColumn {
  key: string;
  label: string;
  /** 'choice' is picked from options; 'number' sorts as a number and, with max, is checked like a score box. */
  type?: 'text' | 'number' | 'choice';
  editable?: boolean;
  /** Editable only while adding a row, for example the student number of a new member. */
  addOnly?: boolean;
  /** A new row is saved only once every required cell has something in it. */
  required?: boolean;
  options?: GridOption[];
  /** For a choice: a typed value that is not on the list is kept as typed, for example a new adviser's name. */
  allowNew?: boolean;
  /** For a choice with allowNew: said under the suggestions for a value not on the list; {text} is the typed value. */
  newHint?: string;
  /** For a choice: an option already used in another row of this column is not suggested again. */
  uniqueOptions?: boolean;
  /** For a score: the maximum, refused above it (never clamped). */
  max?: number;
  /** Offer a filter for this column. */
  filter?: boolean;
  /** CSS grid track, for example '6rem' or 'minmax(12rem, 2fr)'. */
  width?: string;
  align?: 'left' | 'right' | 'center';
}

export interface GridRow {
  id: string;
  cells: Record<string, string>;
  /** A page a cell's text links to; Ctrl+Enter opens the row's first link. */
  links?: Record<string, string>;
  tones?: Record<string, CellTone>;
  /** Cells that cannot be changed in this row, with why. */
  locked?: Record<string, string>;
  /** A note shown under the table while the cell is selected, for example what the judge gave before a correction. */
  notes?: Record<string, string>;
  /** Numbers to sort by where the text is not one, for example a rank shown beside a percentage. */
  sort?: Record<string, number | null>;
  /** The maximum for this row's score cells, when it differs by row (one criterion per row). */
  max?: number;
}

export interface CellChange {
  rowId: string;
  key: string;
  value: string;
}

export interface SavedRow {
  /** The id the table sent, which for a new row is its temporary id. */
  rowId: string;
  /** The row as saved, with its real id; absent when nothing was saved. */
  row?: GridRow;
  /** Cells refused, with why. */
  errors?: Record<string, string>;
  /** The whole row refused, with why. */
  error?: string;
  removed?: boolean;
}

export interface GridResult {
  rows: SavedRow[];
  /** One message for the whole table, for example what a change after release affects. */
  notice?: string;
  /** Shown once to be written down, for example a temporary password. */
  secret?: string;
  /** Something else on the page changed, so the page reloads its data. */
  refresh?: boolean;
}

export const NEW_ROW = 'new:';
export const isNewRow = (id: string) => id.startsWith(NEW_ROW);

/** The changes of one save, grouped by row: row id → column → value. Later changes to the same cell win. */
export function changesByRow(changes: CellChange[]): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const c of changes) out.set(c.rowId, { ...(out.get(c.rowId) ?? {}), [c.key]: String(c.value ?? '') });
  return out;
}

// ── clipboard ───────────────────────────────────────────────────────

/** Cells copied from Excel or Google Sheets: tabs between cells, new lines between rows, quotes around a cell with either. */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let atStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
    } else if (ch === '\t') {
      row.push(cell);
      cell = '';
      atStart = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atStart = true;
    } else {
      cell += ch;
      atStart = false;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

/** Cells as Excel pastes them. */
export function toClipboard(cells: string[][]): string {
  const quote = (c: string) => (/[\t\n\r"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return cells.map((r) => r.map(quote).join('\t')).join('\r\n');
}

// ── matching a typed value ──────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The option a typed value means: an exact label or value, else the only option containing it. */
export function matchOption(text: string, options: GridOption[]): GridOption | null | 'ambiguous' {
  const t = norm(text);
  if (!t) return null;
  const exact = options.filter((o) => norm(o.label) === t || o.value === text.trim());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return 'ambiguous';
  const hits = options.filter((o) => norm(`${o.label} ${o.hint ?? ''}`).includes(t));
  if (hits.length === 1) return hits[0];
  return hits.length ? 'ambiguous' : null;
}

/** Options to suggest while typing, best matches first. */
export function suggestOptions(text: string, options: GridOption[], limit = 8): GridOption[] {
  const t = norm(text);
  if (!t) return options.slice(0, limit);
  const starts: GridOption[] = [];
  const contains: GridOption[] = [];
  for (const o of options) {
    const label = norm(o.label);
    if (label.startsWith(t)) starts.push(o);
    else if (norm(`${o.label} ${o.hint ?? ''}`).includes(t)) contains.push(o);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export type Resolved = { value: string; label: string } | { error: string };

/** What a typed cell means for its column: the value to save and the text to show, or why it is refused. */
export function resolveCell(column: GridColumn, text: string, options: GridOption[] = column.options ?? [], rowMax?: number): Resolved {
  const t = text.trim();
  if (!t) return { value: '', label: '' };
  if (column.type === 'choice') {
    const m = matchOption(t, options);
    if (m === 'ambiguous') return { error: `“${t}” matches more than one ${column.label.toLowerCase()}. Type more of it.` };
    if (m) return { value: m.value, label: m.label };
    if (column.allowNew) return { value: t, label: t };
    return { error: `“${t}” is not on the list for ${column.label}.` };
  }
  const max = column.type === 'number' ? (rowMax ?? column.max) : column.max;
  if (max !== undefined) {
    const check = checkScore(t, max);
    if (check.state === 'error') return { error: check.msg };
    if (check.state === 'ok') return { value: String(check.n), label: fmtScore(check.n) };
  }
  return { value: t, label: t };
}

// ── completing a typed choice, as Excel's AutoComplete does ─────────

/** A choice cell while typing: what was typed, and the match completed after it, if any. */
export interface Completion {
  /** What was typed. */
  typed: string;
  /** The option completed in the cell, or null when the cell holds only what was typed. */
  option: GridOption | null;
  /** The option's place among the matches for what was typed; -1 when nothing is completed. */
  index: number;
  /** What the cell shows, and so exactly what Enter or Tab saves. */
  text: string;
  /** The completed part of the text, shown highlighted, runs from start to end; they are equal when nothing is completed. */
  start: number;
  end: number;
}

/** Options typed text can complete to, best first: the exact label, labels starting with it, then labels or hints containing it. */
export function completionMatches(typed: string, options: GridOption[]): GridOption[] {
  const t = norm(typed);
  if (!t) return options;
  const exact: GridOption[] = [];
  const starts: GridOption[] = [];
  const contains: GridOption[] = [];
  for (const o of options) {
    const label = norm(o.label);
    if (label === t) exact.push(o);
    else if (label.startsWith(t)) starts.push(o);
    else if (norm(`${o.label} ${o.hint ?? ''}`).includes(t)) contains.push(o);
  }
  return [...exact, ...starts, ...contains];
}

/** The cell holding only what was typed. */
export function plainCompletion(typed: string): Completion {
  return { typed, option: null, index: -1, text: typed, start: typed.length, end: typed.length };
}

/**
 * The cell with the match at `index` completed after what was typed. A label starting with the typed text is shown
 * whole; any other match, for example a surname found in a student's name, follows an arrow with its hint.
 */
export function completeWith(typed: string, matches: GridOption[], index: number): Completion {
  const option = matches[index];
  if (!option) return plainCompletion(typed);
  const text = option.label.toLowerCase().startsWith(typed.toLowerCase())
    ? option.label
    : `${typed}${/\s$/.test(typed) ? '' : ' '}→ ${option.label}${option.hint ? ` · ${option.hint}` : ''}`;
  return { typed, option, index, text, start: typed.length, end: text.length };
}

/** What typing leaves in a choice cell: typing at the end completes the best match; deleting, or typing mid-text, never does. */
export function typeCompletion(typed: string, options: GridOption[], completes: boolean): Completion {
  return completes && typed.trim() ? completeWith(typed, completionMatches(typed, options), 0) : plainCompletion(typed);
}

/** Down (step 1) or Up (step -1): the next or previous match, completed the same way. */
export function stepCompletion(c: Completion, matches: GridOption[], step: 1 | -1): Completion {
  const n = matches.length;
  if (!n) return c;
  const index = c.index < 0 ? (step > 0 ? 0 : n - 1) : (c.index + step + n) % n;
  return completeWith(c.typed, matches, index);
}

/** What finishing a cell saves: the completed option exactly as shown, or else what was typed, checked as a paste is. */
export function resolveCompletion(column: GridColumn, c: Completion, options: GridOption[] = column.options ?? [], rowMax?: number): Resolved {
  return c.option ? { value: c.option.value, label: c.option.label } : resolveCell(column, c.typed, options, rowMax);
}

export type Leaving = { save: Completion } | { keep: Completion; reason?: string };

/**
 * What leaving a cell without Enter or Tab does. Nothing is saved that the cell was not showing: what was typed is
 * saved only when it means exactly the entry on screen (an exact or single match shown in the cell, a new value where
 * the column takes one, or a blank). A choice made with Down is saved only by Enter or Tab. Otherwise, and always
 * while the person is away in another window or tab, the cell stays open with only the typed text, unsaved.
 */
export function leaveCompletion(column: GridColumn, c: Completion, away: boolean, options: GridOption[] = column.options ?? [], rowMax?: number): Leaving {
  const typed = plainCompletion(c.typed);
  if (away) return { keep: typed };
  if (column.type !== 'choice') return { save: typed };
  const resolved = resolveCell(column, c.typed, options, rowMax);
  if ('error' in resolved) return { keep: typed, reason: resolved.error };
  if (c.option) {
    return resolved.value === c.option.value ? { save: c } : { keep: typed, reason: `${column.label}: not saved. Only Enter or Tab save a choice from the list.` };
  }
  return norm(resolved.label) === norm(c.typed)
    ? { save: typed }
    : { keep: typed, reason: `${column.label}: not saved, because the cell did not show “${resolved.label}”. Press Down to show it, then Enter.` };
}

// ── column widths ───────────────────────────────────────────────────

const DEFAULT_WIDTH = 'minmax(6rem, 1fr)';

/**
 * The CSS grid tracks for the columns. Each column keeps its minimum width while the table has room; in a narrower
 * table every minimum shrinks by the same share, so the columns always fit and none is cut off.
 */
export function columnTracks(columns: GridColumn[]): string {
  const tracks = columns.map((c) => {
    const width = (c.width ?? DEFAULT_WIDTH).trim();
    const fixed = /^([\d.]+)rem$/.exec(width);
    if (fixed) return { min: Number(fixed[1]), max: width, width };
    const range = /^minmax\(\s*([\d.]+)rem\s*,\s*([^,()]+?)\s*\)$/.exec(width);
    return range ? { min: Number(range[1]), max: range[2], width } : { min: 0, max: width, width };
  });
  const total = tracks.reduce((n, t) => n + t.min, 0);
  return tracks.map((t) => (t.min ? `minmax(min(${t.min}rem, ${Math.floor((t.min / total) * 100000) / 1000}%), ${t.max})` : t.width)).join(' ');
}

// ── search, filter, sort ────────────────────────────────────────────

/** The label a filter uses for an empty cell. */
export const BLANK_FILTER = '(blank)';

/** Rows matching every word of the search (in any cell) and every chosen filter. */
export function filterRows<T extends GridRow>(rows: T[], columns: GridColumn[], search: string, filters: Record<string, string>): T[] {
  const words = norm(search).split(' ').filter(Boolean);
  const active = Object.entries(filters).filter(([, v]) => v);
  if (!words.length && !active.length) return rows;
  return rows.filter((r) => {
    for (const [key, v] of active) {
      const cell = r.cells[key] ?? '';
      if (v === BLANK_FILTER ? cell !== '' : cell !== v) return false;
    }
    if (!words.length) return true;
    const hay = norm(columns.map((c) => r.cells[c.key] ?? '').join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** The values offered by a column's filter, in order. */
export function filterValues(rows: GridRow[], key: string): string[] {
  const set = new Set(rows.map((r) => r.cells[key] ?? ''));
  const vals = [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return set.has('') ? [...vals, BLANK_FILTER] : vals;
}

const sortNumber = (r: GridRow, key: string): number | null => {
  if (r.sort && key in r.sort) return r.sort[key];
  const n = parseFloat((r.cells[key] ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Rows sorted by one column; empty cells always last. Rows that compare equal keep their order. */
export function sortRows<T extends GridRow>(rows: T[], column: GridColumn, dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const numeric = column.type === 'number' || rows.some((r) => r.sort && column.key in r.sort);
  return [...rows].sort((a, b) => {
    if (numeric) {
      const x = sortNumber(a, column.key);
      const y = sortNumber(b, column.key);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (x - y) * sign;
    }
    const x = a.cells[column.key] ?? '';
    const y = b.cells[column.key] ?? '';
    if (!x || !y) return x === y ? 0 : !x ? 1 : -1;
    return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }) * sign;
  });
}

// ── paste ───────────────────────────────────────────────────────────

export interface PastePlan {
  /** Existing cells that will change. */
  changes: { rowId: string; key: string; from: string; to: string; value: string }[];
  /** New rows the paste adds: column → shown text, and column → value to save. */
  newRows: { cells: Record<string, string>; values: Record<string, string> }[];
  /** What was not pasted, and why. */
  problems: string[];
}

export const canEditCell = (column: GridColumn, row: GridRow | null) =>
  !!column.editable && (!column.addOnly || !row || isNewRow(row.id)) && !(row?.locked && column.key in row.locked);

/**
 * What pasting a block of cells will do, starting at a row and column of the table as shown. A single value pasted
 * over a selection fills every selected cell. Rows past the end become new rows when the table allows adding.
 * Nothing is applied here: the table shows the plan and applies it only when the coordinator confirms.
 */
export function planPaste(opts: {
  cells: string[][];
  rows: GridRow[];
  columns: GridColumn[];
  startRow: number;
  startCol: number;
  /** The selected block, when more than one cell is selected: [first row, last row, first column, last column]. */
  selection?: [number, number, number, number] | null;
  canAdd: boolean;
  optionsFor?: (column: GridColumn) => GridOption[];
  rowName?: (row: GridRow) => string;
}): PastePlan {
  const { rows, columns, canAdd } = opts;
  const plan: PastePlan = { changes: [], newRows: [], problems: [] };
  let block = opts.cells.filter((r, i, all) => !(i === all.length - 1 && r.every((c) => c === '')));
  let startRow = opts.startRow;
  let startCol = opts.startCol;
  const sel = opts.selection;
  if (sel && block.length === 1 && block[0].length === 1 && (sel[1] > sel[0] || sel[3] > sel[2])) {
    // One value over a selection fills it, as in Excel.
    block = Array.from({ length: sel[1] - sel[0] + 1 }, () => Array(sel[3] - sel[2] + 1).fill(block[0][0]));
    startRow = sel[0];
    startCol = sel[2];
  }
  const skippedColumns = new Set<string>();
  const refused: string[] = [];
  let overflowRows = 0;
  let overflowCols = 0;
  block.forEach((line, i) => {
    const r = startRow + i;
    const row = r < rows.length ? rows[r] : null;
    if (!row && !canAdd) {
      overflowRows++;
      return;
    }
    const fresh = { cells: {} as Record<string, string>, values: {} as Record<string, string> };
    line.forEach((text, j) => {
      const column = columns[startCol + j];
      if (!column) {
        overflowCols = Math.max(overflowCols, line.length - j);
        return;
      }
      if (!canEditCell(column, row)) {
        if (text !== '' || row) skippedColumns.add(row?.locked?.[column.key] ? `${column.label} (${row.locked[column.key]})` : column.label);
        return;
      }
      const resolved = resolveCell(column, text, opts.optionsFor?.(column), row?.max);
      if ('error' in resolved) {
        refused.push(`${row ? (opts.rowName?.(row) ?? `Row ${r + 1}`) : 'New row'}, ${column.label}: ${resolved.error}`);
        return;
      }
      if (row) {
        const from = row.cells[column.key] ?? '';
        if (from !== resolved.label) plan.changes.push({ rowId: row.id, key: column.key, from, to: resolved.label, value: resolved.value });
      } else if (resolved.label) {
        fresh.cells[column.key] = resolved.label;
        fresh.values[column.key] = resolved.value;
      }
    });
    if (!row && Object.keys(fresh.values).length) plan.newRows.push(fresh);
  });
  if (skippedColumns.size) plan.problems.push(`Not changed here, so skipped: ${[...skippedColumns].join(', ')}.`);
  if (overflowRows) plan.problems.push(`${overflowRows} pasted row${overflowRows === 1 ? '' : 's'} went past the end of the table and ${overflowRows === 1 ? 'was' : 'were'} left out.`);
  if (overflowCols) plan.problems.push(`${overflowCols} pasted column${overflowCols === 1 ? '' : 's'} went past the last column and ${overflowCols === 1 ? 'was' : 'were'} left out.`);
  if (refused.length) plan.problems.push(...refused.slice(0, 6), ...(refused.length > 6 ? [`…and ${refused.length - 6} more values that could not be used.`] : []));
  return plan;
}

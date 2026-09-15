'use client';

// The one spreadsheet table of the coordinator's screens. It behaves like Excel: type into a cell to change it, Tab and
// the arrow keys move, Enter moves down, paste a block from Excel, type in the blank row at the bottom to add a row.
// Changes save by themselves in the background, with one indicator for the whole table. Logic that needs no browser
// lives in lib/grid.ts; the saving is the page's server action.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  canEditCell,
  columnTracks,
  completeWith,
  completionMatches,
  filterRows,
  filterValues,
  isNewRow,
  leaveCompletion,
  NEW_ROW,
  parseClipboard,
  plainCompletion,
  planPaste,
  resolveCompletion,
  sortRows,
  stepCompletion,
  toClipboard,
  typeCompletion,
  type CellChange,
  type Completion,
  type GridColumn,
  type GridOption,
  type GridResult,
  type GridRow,
  type PastePlan,
} from '@/lib/grid';

const BLANK = '__blank__';

/** A row as the table holds it: `key` never changes, while `row.id` changes from a temporary id once a new row is saved. */
interface LocalRow {
  key: string;
  row: GridRow;
}

/** A cell being typed in; its text, and for a choice the match completed in it, come from Completion. */
interface Editing extends Completion {
  key: string;
  col: string;
  /** 'enter': started by typing, so the arrow keys finish the cell and move (as in Excel). 'edit': F2 or double-click, so they move the cursor. */
  mode: 'enter' | 'edit';
}

export interface RowAction {
  label: string;
  run: (rowId: string) => Promise<GridResult>;
  /** Asked before running, for example "Reset this judge's password?". */
  confirm?: string;
}

export interface DataGridProps {
  /** What the table lists, for screen readers and messages, for example "Groups". */
  label: string;
  columns: GridColumn[];
  rows: GridRow[];
  /** Saves changed cells. `note` is the text of the note box, when the table has one. */
  save?: (changes: CellChange[], note: string) => Promise<GridResult>;
  /** Removes rows (Ctrl+Delete). */
  remove?: (rowIds: string[]) => Promise<GridResult>;
  removeLabel?: string;
  /** Typing in the blank row at the bottom adds a row. Defaults to on when the table saves. */
  canAdd?: boolean;
  addHint?: string;
  actions?: RowAction[];
  /** The column whose text names a row in messages. */
  rowName?: string;
  /** A box above the table whose text goes with every save, for example the reason for score corrections. */
  note?: { label: string; placeholder?: string; requiredMessage?: string };
  searchPlaceholder?: string;
  emptyText?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}

export function DataGrid(props: DataGridProps) {
  const { columns, save, remove, actions = [], label } = props;
  const canAdd = (props.canAdd ?? !!save) && !!save;
  const router = useRouter();
  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  const [local, setLocal] = useState<LocalRow[]>(() => props.rows.map((row) => ({ key: row.id, row })));
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(props.initialSort ?? null);
  /** Rows added here since the order was last worked out; they stay at the bottom until the next sort or search. */
  const [added, setAdded] = useState<string[]>([]);
  const [active, setActive] = useState<{ key: string; col: string } | null>(null);
  const [anchor, setAnchor] = useState<{ key: string; col: string } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<Map<string, Record<string, string>>>(new Map());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<(PastePlan & { byCell: Map<string, Record<string, string>> }) | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [netError, setNetError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  // Latest values for callbacks that must keep one identity. The rows change only through updateLocal, which keeps
  // localRef current at once, so a save sent before React redraws still sees every row and every saved id.
  const localRef = useRef(local);
  const updateLocal = useCallback((change: (old: LocalRow[]) => LocalRow[]) => {
    localRef.current = change(localRef.current);
    setLocal(localRef.current);
  }, []);
  const noteText = useRef(note);
  noteText.current = note;
  const editingRef = useRef(editing);
  editingRef.current = editing;

  // A page that reloads its data (after something else on it changed) replaces the rows, keeping unsaved new rows.
  const firstRows = useRef(props.rows);
  useEffect(() => {
    if (firstRows.current === props.rows) return;
    firstRows.current = props.rows;
    updateLocal((old) => [...props.rows.map((row) => ({ key: row.id, row })), ...old.filter((l) => isNewRow(l.row.id))]);
  }, [props.rows, updateLocal]);

  const colIndex = useMemo(() => new Map(columns.map((c, i) => [c.key, i])), [columns]);
  const byKey = useMemo(() => new Map(local.map((l) => [l.key, l])), [local]);
  const structure = local.map((l) => l.key).join('\n');

  const order = useMemo(() => {
    const addedSet = new Set(added);
    const base = localRef.current.filter((l) => !addedSet.has(l.key));
    const matched = filterRows(
      base.map((l) => ({ ...l.row, key: l.key })),
      columns,
      query,
      filters,
    );
    const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
    const sorted = column && sort ? sortRows(matched, column, sort.dir) : matched;
    return [...sorted.map((r) => r.key), ...added.filter((k) => localRef.current.some((l) => l.key === k))];
    // The order is worked out again when rows come or go, or the search, filters or sort change; not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure, query, filters, sort, columns, added]);

  const visible = useMemo(() => order.map((k) => byKey.get(k)).filter((l): l is LocalRow => !!l), [order, byKey]);
  const keys = useMemo(() => [...visible.map((l) => l.key), ...(canAdd ? [BLANK] : [])], [visible, canAdd]);
  const rowAt = (key: string) => (key === BLANK ? null : (byKey.get(key)?.row ?? null));

  // ── saving ────────────────────────────────────────────────────
  /** Cells of saved rows waiting to be sent: row key → column → value. */
  const pending = useRef(new Map<string, Map<string, string>>());
  /** New rows waiting to be sent whole, with the values typed so far. */
  const newValues = useRef(new Map<string, Record<string, string>>());
  const pendingNew = useRef(new Set<string>());
  const sendingNew = useRef(new Set<string>());
  const inFlight = useRef(false);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const missingFor = useCallback(
    (key: string) => columns.filter((c) => c.required && !(newValues.current.get(key)?.[c.key] ?? '').trim()),
    [columns],
  );

  const countWaiting = useCallback(() => {
    let n = 0;
    for (const cols of pending.current.values()) n += cols.size;
    n += pendingNew.current.size;
    setWaiting(n);
  }, []);

  const flushRef = useRef<() => void>(() => {});
  const scheduleFlush = useCallback((delay = 40) => {
    countWaiting();
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      flushRef.current();
    }, delay);
  }, [countWaiting]);

  const applyResult = useCallback(
    (res: GridResult, sent: { key: string; rowId: string; cols: string[] }[]) => {
      const keyOfRowId = new Map(sent.map((s) => [s.rowId, s.key]));
      updateLocal((old) => {
        let next = old;
        for (const s of res.rows) {
          const key = keyOfRowId.get(s.rowId) ?? old.find((l) => l.row.id === s.rowId)?.key;
          if (!key) continue;
          if (s.removed) {
            next = next.filter((l) => l.key !== key);
            continue;
          }
          if (!s.row) continue;
          const waitingCols = pending.current.get(key);
          next = next.map((l) => {
            if (l.key !== key) return l;
            // A cell typed again while this save was on its way keeps the newer text, and a refused cell keeps what was
            // typed so it can be corrected; its old value is still what is saved.
            const cells = { ...s.row!.cells };
            if (waitingCols) for (const col of waitingCols.keys()) cells[col] = l.row.cells[col] ?? '';
            for (const col of Object.keys(s.errors ?? {})) cells[col] = l.row.cells[col] ?? '';
            return { key, row: { ...s.row!, cells } };
          });
          if (isNewRow(s.rowId) && !isNewRow(s.row.id)) newValues.current.delete(key);
        }
        return next;
      });
      setErrors((old) => {
        const next = new Map(old);
        for (const s of sent) {
          const mine = { ...(next.get(s.key) ?? {}) };
          for (const col of s.cols) delete mine[col];
          if (Object.keys(mine).length) next.set(s.key, mine);
          else next.delete(s.key);
        }
        for (const s of res.rows) {
          if (!s.errors) continue;
          const key = keyOfRowId.get(s.rowId) ?? s.rowId;
          next.set(key, { ...(next.get(key) ?? {}), ...s.errors });
        }
        return next;
      });
      setRowErrors((old) => {
        const next = { ...old };
        for (const s of sent) delete next[s.key];
        for (const s of res.rows) if (s.error) next[keyOfRowId.get(s.rowId) ?? s.rowId] = s.error;
        return next;
      });
      if (res.notice) setNotice(res.notice);
      if (res.secret) setSecret(res.secret);
      if (res.refresh) router.refresh();
    },
    [router, updateLocal],
  );

  const flush = useCallback(async () => {
    if (inFlight.current || !save) return;
    const current = new Map(localRef.current.map((l) => [l.key, l]));
    const changes: CellChange[] = [];
    const sent: { key: string; rowId: string; cols: string[] }[] = [];
    for (const [key, cols] of pending.current) {
      const l = current.get(key);
      if (!l) continue;
      if (isNewRow(l.row.id)) {
        // Its first save failed, so the whole row goes again.
        const vals = newValues.current.get(key) ?? {};
        for (const [col, v] of cols) vals[col] = v;
        newValues.current.set(key, vals);
        pendingNew.current.add(key);
        continue;
      }
      for (const [col, value] of cols) changes.push({ rowId: l.row.id, key: col, value });
      sent.push({ key, rowId: l.row.id, cols: [...cols.keys()] });
    }
    pending.current = new Map();
    for (const key of [...pendingNew.current]) {
      const l = current.get(key);
      if (!l) {
        pendingNew.current.delete(key);
        continue;
      }
      if (missingFor(key).length) continue;
      const vals = newValues.current.get(key) ?? {};
      for (const [col, value] of Object.entries(vals)) changes.push({ rowId: l.row.id, key: col, value });
      sent.push({ key, rowId: l.row.id, cols: Object.keys(vals) });
      pendingNew.current.delete(key);
      sendingNew.current.add(key);
    }
    countWaiting();
    if (!changes.length) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await save(changes, noteText.current);
      failures.current = 0;
      setNetError(null);
      applyResult(res, sent);
    } catch {
      failures.current++;
      for (const s of sent) {
        const l = current.get(s.key);
        if (!l) continue;
        if (isNewRow(s.rowId)) {
          pendingNew.current.add(s.key);
          continue;
        }
        const cols = pending.current.get(s.key) ?? new Map<string, string>();
        for (const ch of changes) if (ch.rowId === s.rowId && !cols.has(ch.key)) cols.set(ch.key, ch.value);
        pending.current.set(s.key, cols);
      }
      setNetError(
        failures.current < 5
          ? 'Not saved yet: the server could not be reached. Trying again…'
          : 'Not saved: the server keeps refusing. Copy anything you typed, then reload the page.',
      );
      if (failures.current < 5) setTimeout(() => flushRef.current(), 2500 * failures.current);
    } finally {
      for (const s of sent) sendingNew.current.delete(s.key);
      inFlight.current = false;
      setBusy(false);
      countWaiting();
      if (failures.current === 0 && (pending.current.size || [...pendingNew.current].some((k) => !missingFor(k).length))) scheduleFlush(0);
    }
  }, [save, missingFor, applyResult, countWaiting, scheduleFlush]);
  flushRef.current = flush;

  const unsaved = busy || waiting > 0 || !!netError;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const setCellError = useCallback((key: string, col: string, msg: string | null) => {
    setErrors((old) => {
      const next = new Map(old);
      const mine = { ...(next.get(key) ?? {}) };
      if (msg) mine[col] = msg;
      else delete mine[col];
      if (Object.keys(mine).length) next.set(key, mine);
      else next.delete(key);
      return next;
    });
  }, []);

  const optionsFor = useCallback(
    (column: GridColumn, exceptKey?: string) => {
      const all = column.options ?? [];
      if (!column.uniqueOptions) return all;
      const used = new Set(localRef.current.filter((l) => l.key !== exceptKey).map((l) => l.row.cells[column.key]).filter(Boolean));
      return all.filter((o) => !used.has(o.label));
    },
    [],
  );

  /** Puts typed values into cells and queues them. Returns the key of the row written, which is new for the blank row. */
  const writeCells = useCallback(
    (key: string, values: { col: string; label: string; value: string }[]): string | null => {
      if (!save || !values.length) return null;
      if (props.note?.requiredMessage && !noteText.current.trim()) {
        setHint(props.note.requiredMessage);
        noteRef.current?.focus();
        return null;
      }
      let target = key;
      if (key === BLANK) {
        const real = values.filter((v) => v.label);
        if (!real.length) return null;
        target = `${NEW_ROW}${Date.now().toString(36)}-${++counter.current}`;
        const cells = Object.fromEntries(real.map((v) => [v.col, v.label]));
        const newKey = target;
        updateLocal((old) => [...old, { key: newKey, row: { id: newKey, cells } }]);
        setAdded((old) => [...old, newKey]);
        newValues.current.set(newKey, Object.fromEntries(real.map((v) => [v.col, v.value])));
        pendingNew.current.add(newKey);
        scheduleFlush();
        return newKey;
      }
      const l = localRef.current.find((x) => x.key === key);
      if (!l) return null;
      updateLocal((old) => old.map((x) => (x.key === key ? { key, row: { ...x.row, cells: { ...x.row.cells, ...Object.fromEntries(values.map((v) => [v.col, v.label])) } } } : x)));
      if (isNewRow(l.row.id) && !sendingNew.current.has(key)) {
        const vals = { ...(newValues.current.get(key) ?? {}) };
        for (const v of values) vals[v.col] = v.value;
        newValues.current.set(key, vals);
        pendingNew.current.add(key);
      } else {
        const cols = pending.current.get(key) ?? new Map<string, string>();
        for (const v of values) cols.set(v.col, v.value);
        pending.current.set(key, cols);
      }
      scheduleFlush();
      return key;
    },
    [save, scheduleFlush, props.note, updateLocal],
  );

  /** Finishes typing in a cell: checks it, shows it and queues it to save. */
  const commit = useCallback(
    (key: string, col: string, entry: Completion): string | null => {
      const column = columns[colIndex.get(col)!];
      const row = key === BLANK ? null : (localRef.current.find((l) => l.key === key)?.row ?? null);
      const resolved = resolveCompletion(column, entry, optionsFor(column, key), row?.max);
      if ('error' in resolved) {
        if (key === BLANK) {
          setHint(resolved.error);
          return null;
        }
        updateLocal((old) => old.map((x) => (x.key === key ? { key, row: { ...x.row, cells: { ...x.row.cells, [col]: entry.typed.trim() } } } : x)));
        setCellError(key, col, resolved.error);
        return key;
      }
      const hadError = !!errors.get(key)?.[col];
      if (row && resolved.label === (row.cells[col] ?? '') && !hadError) return key;
      setCellError(key, col, null);
      return writeCells(key, [{ col, label: resolved.label, value: resolved.value }]);
    },
    [columns, colIndex, errors, optionsFor, setCellError, writeCells, updateLocal],
  );

  // ── moving ────────────────────────────────────────────────────
  const tabStart = useRef<string | null>(null);

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });

  const moveTo = useCallback(
    (key: string, col: string, extend = false) => {
      setActive({ key, col });
      if (!extend) setAnchor({ key, col });
      setHint(null);
    },
    [],
  );

  const moveBy = useCallback(
    (from: { key: string; col: string }, dr: number, dc: number, opts: { extend?: boolean; wrap?: boolean } = {}) => {
      let r = keys.indexOf(from.key);
      let c = colIndex.get(from.col) ?? 0;
      if (r < 0) r = 0;
      c += dc;
      if (opts.wrap && c >= columns.length) {
        c = 0;
        r++;
      } else if (opts.wrap && c < 0) {
        c = columns.length - 1;
        r--;
      }
      r = Math.max(0, Math.min(keys.length - 1, r + dr));
      c = Math.max(0, Math.min(columns.length - 1, c));
      if (!keys.length) return;
      moveTo(keys[r], columns[c].key, opts.extend);
    },
    [keys, colIndex, columns, moveTo],
  );

  useEffect(() => {
    if (!active || !gridRef.current) return;
    const el = gridRef.current.querySelector<HTMLElement>(`[data-k="${CSS.escape(active.key)}"][data-c="${CSS.escape(active.col)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const selection = useMemo((): [number, number, number, number] | null => {
    if (!active || !anchor) return null;
    const r1 = keys.indexOf(active.key);
    const r2 = keys.indexOf(anchor.key);
    const c1 = colIndex.get(active.col) ?? 0;
    const c2 = colIndex.get(anchor.col) ?? 0;
    if (r1 < 0 || r2 < 0) return null;
    return [Math.min(r1, r2), Math.max(r1, r2), Math.min(c1, c2), Math.max(c1, c2)];
  }, [active, anchor, keys, colIndex]);
  const multi = !!selection && (selection[1] > selection[0] || selection[3] > selection[2]);

  const startEdit = useCallback(
    (key: string, col: string, text: string | null, mode: Editing['mode']) => {
      const column = columns[colIndex.get(col)!];
      const row = key === BLANK ? null : (localRef.current.find((l) => l.key === key)?.row ?? null);
      if (!save || !canEditCell(column, row)) {
        setHint(row?.locked?.[col] ?? (column.editable && column.addOnly ? `${column.label} is set when a row is added and cannot be changed here.` : `${column.label} cannot be changed here.`));
        return;
      }
      if (props.note?.requiredMessage && !noteText.current.trim()) {
        setHint(props.note.requiredMessage);
        noteRef.current?.focus();
        return;
      }
      setHint(null);
      const entry = column.type === 'choice' && text ? typeCompletion(text, optionsFor(column, key), true) : plainCompletion(text ?? row?.cells[col] ?? '');
      setEditing({ key, col, mode, ...entry });
    },
    [columns, colIndex, save, props.note, optionsFor],
  );

  const endEdit = useCallback(
    (how: 'commit' | 'cancel', move?: { dr: number; dc: number; wrap?: boolean; col?: string }, entry?: Completion) => {
      // Leaving the cell also blurs its box, which ends the edit again before React has redrawn; only the first counts.
      const e = editingRef.current;
      if (!e) return;
      editingRef.current = null;
      setEditing(null);
      const key = how === 'commit' ? (commit(e.key, e.col, entry ?? e) ?? e.key) : e.key;
      focusGrid();
      const col = move?.col ?? e.col;
      if (key !== e.key && !keys.includes(key)) {
        // The blank row just became a new row: stay on it when moving sideways; moving down reaches the next blank row.
        const c = (colIndex.get(e.col) ?? 0) + (move?.dc ?? 0);
        if (!move || (move.dr === 0 && c >= 0 && c < columns.length)) moveTo(key, move ? columns[c].key : e.col);
        else if (move.dr === 0) moveTo(BLANK, columns[c < 0 ? columns.length - 1 : 0].key);
        else moveTo(move.dr > 0 ? BLANK : key, col);
        return;
      }
      if (move) moveBy({ key, col }, move.dr, move.dc, { wrap: move.wrap });
    },
    [commit, moveBy, moveTo, keys, colIndex, columns],
  );

  /** Leaves the cell other than by Enter or Tab. Returns false when the cell stays open, with what was typed kept unsaved. */
  const leaveEdit = useCallback(
    (move?: { dr: number; dc: number }): boolean => {
      const e = editingRef.current;
      if (!e) return true;
      const column = columns[colIndex.get(e.col)!];
      const row = e.key === BLANK ? null : (localRef.current.find((l) => l.key === e.key)?.row ?? null);
      const away = document.visibilityState === 'hidden' || !document.hasFocus();
      const leaving = leaveCompletion(column, e, away, optionsFor(column, e.key), row?.max);
      if ('save' in leaving) {
        endEdit('commit', move, leaving.save);
        return true;
      }
      const kept = { ...e, ...leaving.keep };
      editingRef.current = kept;
      setEditing(kept);
      if (leaving.reason) setHint(leaving.reason);
      return false;
    },
    [columns, colIndex, optionsFor, endEdit],
  );

  useEffect(() => {
    if (!editing || keys.includes(editing.key)) return;
    editingRef.current = null;
    setEditing(null);
    setHint(null);
  }, [editing, keys]);

  // When the blank row becomes a new row, the next blank row is below it; keep the cursor on the new row.
  useEffect(() => {
    if (active && active.key !== BLANK && !byKey.has(active.key)) setActive(null);
  }, [active, byKey]);

  const removeActive = useCallback(() => {
    if (!remove || !active || active.key === BLANK) return;
    const l = byKey.get(active.key);
    if (!l) return;
    const name = (props.rowName && l.row.cells[props.rowName]) || 'this row';
    if (isNewRow(l.row.id)) {
      updateLocal((old) => old.filter((x) => x.key !== l.key));
      pendingNew.current.delete(l.key);
      newValues.current.delete(l.key);
      countWaiting();
      return;
    }
    setConfirm({
      text: `${props.removeLabel ?? 'Remove'} ${name}? Press Enter to confirm or Esc to keep it.`,
      run: async () => {
        setBusy(true);
        try {
          applyResult(await remove([l.row.id]), [{ key: l.key, rowId: l.row.id, cols: [] }]);
        } catch {
          setNetError('Not removed: the server could not be reached. Try again.');
        } finally {
          setBusy(false);
        }
      },
    });
  }, [remove, active, byKey, props.rowName, props.removeLabel, applyResult, countWaiting, updateLocal]);

  const runAction = useCallback(
    (a: RowAction) => {
      if (!active || active.key === BLANK) return;
      const l = byKey.get(active.key);
      if (!l || isNewRow(l.row.id)) return;
      const go = async () => {
        setBusy(true);
        try {
          applyResult(await a.run(l.row.id), [{ key: l.key, rowId: l.row.id, cols: [] }]);
        } catch {
          setNetError(`${a.label} did not happen: the server could not be reached. Try again.`);
        } finally {
          setBusy(false);
        }
      };
      const name = (props.rowName && l.row.cells[props.rowName]) || 'this row';
      if (a.confirm) setConfirm({ text: `${a.confirm.replace('{name}', name)} Press Enter to confirm or Esc to cancel.`, run: go });
      else void go();
    },
    [active, byKey, applyResult, props.rowName],
  );

  // ── paste and copy ────────────────────────────────────────────
  const beginPaste = useCallback(
    (text: string) => {
      if (!save) return;
      if (!active) {
        setHint('Click the cell where the top-left pasted value should go, then paste again.');
        return;
      }
      const cells = parseClipboard(text);
      if (!cells.length) return;
      const rows = visible.map((l) => l.row);
      const startRow = keys.indexOf(active.key);
      const p = planPaste({
        cells,
        rows,
        columns,
        startRow: startRow < 0 ? rows.length : startRow,
        startCol: colIndex.get(active.col) ?? 0,
        selection: multi ? selection : null,
        canAdd,
        optionsFor: (c) => optionsFor(c),
        rowName: props.rowName ? (r) => r.cells[props.rowName!] || 'Row' : undefined,
      });
      if (!p.changes.length && !p.newRows.length) {
        setNotice(p.problems.length ? `Nothing pasted. ${p.problems.join(' ')}` : 'Nothing to change: the pasted values are already in the table.');
        return;
      }
      const byCell = new Map<string, Record<string, string>>();
      const keyOf = new Map(visible.map((l) => [l.row.id, l.key]));
      for (const ch of p.changes) {
        const k = keyOf.get(ch.rowId)!;
        byCell.set(k, { ...(byCell.get(k) ?? {}), [ch.key]: ch.to });
      }
      setPlan({ ...p, byCell });
    },
    [save, active, visible, keys, columns, colIndex, multi, selection, canAdd, optionsFor, props.rowName],
  );

  const applyPlan = useCallback(() => {
    if (!plan) return;
    const keyOf = new Map(localRef.current.map((l) => [l.row.id, l.key]));
    const byRow = new Map<string, { col: string; label: string; value: string }[]>();
    for (const ch of plan.changes) {
      const k = keyOf.get(ch.rowId);
      if (!k) continue;
      byRow.set(k, [...(byRow.get(k) ?? []), { col: ch.key, label: ch.to, value: ch.value }]);
      setCellError(k, ch.key, null);
    }
    for (const [k, vals] of byRow) writeCells(k, vals);
    for (const nr of plan.newRows) writeCells(BLANK, Object.keys(nr.values).map((col) => ({ col, label: nr.cells[col], value: nr.values[col] })));
    setNotice(`Pasted: ${plan.changes.length} cell${plan.changes.length === 1 ? '' : 's'} changed${plan.newRows.length ? `, ${plan.newRows.length} row${plan.newRows.length === 1 ? '' : 's'} added` : ''}.`);
    setPlan(null);
    focusGrid();
  }, [plan, writeCells, setCellError]);

  const copySelection = useCallback((): string => {
    if (!selection) return '';
    const out: string[][] = [];
    for (let r = selection[0]; r <= selection[1]; r++) {
      const row = rowAt(keys[r]);
      const line: string[] = [];
      for (let c = selection[2]; c <= selection[3]; c++) line.push(row?.cells[columns[c].key] ?? '');
      out.push(line);
    }
    return toClipboard(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, keys, columns, byKey]);

  const clearSelection = useCallback(() => {
    if (!selection || !save) return;
    const byRow = new Map<string, { col: string; label: string; value: string }[]>();
    for (let r = selection[0]; r <= selection[1]; r++) {
      const key = keys[r];
      const row = rowAt(key);
      if (!row) continue;
      for (let c = selection[2]; c <= selection[3]; c++) {
        const column = columns[c];
        if (!canEditCell(column, row) || !(row.cells[column.key] ?? '')) continue;
        byRow.set(key, [...(byRow.get(key) ?? []), { col: column.key, label: '', value: '' }]);
      }
    }
    for (const [k, vals] of byRow) writeCells(k, vals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, save, keys, columns, byKey, writeCells]);

  // ── keys ──────────────────────────────────────────────────────
  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== gridRef.current) return;
    const mod = e.ctrlKey || e.metaKey;
    if (confirm) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const run = confirm.run;
        setConfirm(null);
        run();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setConfirm(null);
      }
      return;
    }
    if (plan) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyPlan();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPlan(null);
      }
      return;
    }
    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (!active) {
      if (keys.length && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home'].includes(e.key)) {
        e.preventDefault();
        moveTo(keys[0], columns[0].key);
      }
      return;
    }
    const extend = e.shiftKey;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        tabStart.current = null;
        const d = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]!;
        if (mod) {
          const r = d[0] > 0 ? keys.length - 1 : d[0] < 0 ? 0 : keys.indexOf(active.key);
          const c = d[1] > 0 ? columns.length - 1 : d[1] < 0 ? 0 : colIndex.get(active.col)!;
          moveTo(keys[r], columns[c].key, extend);
        } else moveBy(active, d[0], d[1], { extend });
        return;
      }
      case 'Tab': {
        // Tab past the last cell, or Shift+Tab before the first, leaves the table, so the keyboard is never trapped in it.
        const r = keys.indexOf(active.key);
        const c = colIndex.get(active.col) ?? 0;
        if ((!e.shiftKey && r === keys.length - 1 && c === columns.length - 1) || (e.shiftKey && r === 0 && c === 0)) return;
        e.preventDefault();
        if (tabStart.current === null) tabStart.current = active.col;
        moveBy(active, 0, e.shiftKey ? -1 : 1, { wrap: true });
        return;
      }
      case 'Enter': {
        e.preventDefault();
        if (mod) {
          const href = rowAt(active.key)?.links && Object.values(rowAt(active.key)!.links!)[0];
          if (href) router.push(href);
          return;
        }
        const col = tabStart.current ?? active.col;
        tabStart.current = null;
        moveBy({ key: active.key, col }, e.shiftKey ? -1 : 1, 0);
        return;
      }
      case 'Home':
      case 'End': {
        e.preventDefault();
        const c = e.key === 'Home' ? 0 : columns.length - 1;
        const r = mod ? (e.key === 'Home' ? 0 : keys.length - 1) : keys.indexOf(active.key);
        moveTo(keys[r], columns[c].key, extend);
        return;
      }
      case 'PageDown':
      case 'PageUp':
        e.preventDefault();
        moveBy(active, e.key === 'PageDown' ? 15 : -15, 0, { extend });
        return;
      case 'F2':
        e.preventDefault();
        startEdit(active.key, active.col, null, 'edit');
        return;
      case 'Escape':
        if (editingRef.current) {
          endEdit('cancel');
          return;
        }
        setAnchor(active);
        setNotice(null);
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (mod) removeActive();
        else if (e.key === 'Backspace' && !multi) startEdit(active.key, active.col, '', 'enter');
        else clearSelection();
        return;
      case 'c':
      case 'C':
      case 'x':
      case 'X':
      case 'v':
      case 'V':
        if (mod) return; // the copy, cut and paste events below handle these
    }
    if (e.key.length === 1 && !mod && !e.altKey) {
      e.preventDefault();
      startEdit(active.key, active.col, e.key, 'enter');
    }
  };

  const onEditorKey = (e: React.KeyboardEvent<HTMLInputElement>, matches: GridOption[]) => {
    if (!editing) return;
    e.stopPropagation();
    switch (e.key) {
      case 'Enter': {
        e.preventDefault();
        const col = tabStart.current ?? editing.col;
        tabStart.current = null;
        endEdit('commit', { dr: e.shiftKey ? -1 : 1, dc: 0, col });
        return;
      }
      case 'Tab':
        e.preventDefault();
        if (tabStart.current === null) tabStart.current = editing.col;
        endEdit('commit', { dr: 0, dc: e.shiftKey ? -1 : 1, wrap: true });
        return;
      case 'Escape':
        e.preventDefault();
        // The first Esc takes the completion away, keeping what was typed; the next leaves the cell as it was.
        setHint(null);
        if (editing.option) setEditing({ ...editing, ...plainCompletion(editing.typed) });
        else endEdit('cancel');
        return;
      case 'ArrowDown':
      case 'ArrowUp':
        if (matches.length) {
          e.preventDefault();
          setHint(null);
          setEditing({ ...editing, ...stepCompletion(editing, matches, e.key === 'ArrowDown' ? 1 : -1) });
          return;
        }
        if (editing.mode === 'enter') {
          e.preventDefault();
          tabStart.current = null;
          endEdit('commit', { dr: e.key === 'ArrowDown' ? 1 : -1, dc: 0 });
        }
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (editing.mode === 'enter') {
          e.preventDefault();
          tabStart.current = null;
          leaveEdit({ dr: 0, dc: e.key === 'ArrowRight' ? 1 : -1 });
        }
        return;
    }
  };

  const onCopy = (e: React.ClipboardEvent) => {
    if (editing || e.target !== gridRef.current) return;
    const text = copySelection();
    if (!text) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  };

  const onCut = (e: React.ClipboardEvent) => {
    onCopy(e);
    if (!editing && e.target === gridRef.current) clearSelection();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (editing || e.target !== gridRef.current) return;
    e.preventDefault();
    beginPaste(e.clipboardData.getData('text/plain'));
  };

  const onEditorPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n\r]/.test(text.replace(/[\r\n]+$/, ''))) return;
    e.preventDefault();
    editingRef.current = null;
    setEditing(null);
    focusGrid();
    beginPaste(text);
  };

  // One object with a fixed identity, so rows that did not change are not drawn again.
  const api = useRef({
    down: (_key: string, _col: string, _e: React.MouseEvent) => {},
    double: (_key: string, _col: string) => {},
    setText: (_t: string, _completes: boolean) => {},
    editorKey: (_e: React.KeyboardEvent<HTMLInputElement>, _s: GridOption[]) => {},
    editorBlur: () => {},
    editorPaste: (_e: React.ClipboardEvent<HTMLInputElement>) => {},
    pick: (_o: GridOption) => {},
    options: (_c: GridColumn, _key: string): GridOption[] => [],
  });
  const touch = useRef(false);
  api.current.down = (key, col, e) => {
    if (editing && editing.key === key && editing.col === col) return;
    if ((e.target as HTMLElement).closest('a')) return;
    e.preventDefault();
    if (editing && !leaveEdit()) {
      gridRef.current?.querySelector<HTMLInputElement>('.dg-input')?.focus({ preventScroll: true });
      return;
    }
    tabStart.current = null;
    moveTo(key, col, e.shiftKey && !!active);
    focusGrid();
    if (touch.current) startEdit(key, col, null, 'edit');
  };
  api.current.double = (key, col) => startEdit(key, col, null, 'edit');
  api.current.setText = (text, completes) => {
    if (!editing) return;
    const column = columns[colIndex.get(editing.col) ?? 0];
    setHint(null);
    setEditing({ ...editing, ...(column.type === 'choice' ? typeCompletion(text, optionsFor(column, editing.key), completes) : plainCompletion(text)) });
  };
  api.current.editorKey = onEditorKey;
  api.current.editorBlur = () => {
    if (editing) leaveEdit();
  };
  api.current.editorPaste = onEditorPaste;
  api.current.pick = (o) => {
    if (editing) endEdit('commit', undefined, completeWith(editing.typed, [o], 0));
  };
  api.current.options = (c, key) => optionsFor(c, key);

  // ── drawing ───────────────────────────────────────────────────
  const template = useMemo(() => columnTracks(columns), [columns]);
  const firstEditable = (columns.find((c) => c.editable && c.required) ?? columns.find((c) => c.editable))?.key;
  const errorCount = [...errors.values()].reduce((n, m) => n + Object.keys(m).length, 0) + Object.keys(rowErrors).length;
  const newWaiting = [...pendingNew.current].filter((k) => missingFor(k).length);
  const activeRow = active ? rowAt(active.key) : null;
  const activeColumn = active ? columns[colIndex.get(active.col) ?? 0] : null;
  const activeKeyIsSaved = !!activeRow && !isNewRow(activeRow.id);

  let status: { cls: string; text: string };
  if (netError) status = { cls: 'err', text: netError };
  else if (busy || waiting - newWaiting.length > 0) status = { cls: 'busy', text: 'Saving…' };
  else if (errorCount) status = { cls: 'err', text: `${errorCount} not saved: see the red cell${errorCount === 1 ? '' : 's'}` };
  else if (newWaiting.length) {
    const missing = missingFor(newWaiting[0]).map((c) => c.label);
    status = { cls: 'wait', text: `New row not saved yet: type the ${missing.join(' and ')}` };
  } else status = { cls: 'ok', text: save ? 'All changes saved' : `${visible.length} shown` };

  const where = active && activeColumn ? `${activeRow ? (props.rowName && activeRow.cells[props.rowName]) || 'Row' : 'New row'} · ${activeColumn.label}` : null;
  const activeError = active ? (errors.get(active.key)?.[active.col] ?? rowErrors[active.key]) : undefined;
  const activeInfo = activeError ?? hint ?? (active && activeRow ? (activeRow.notes?.[active.col] ?? activeRow.locked?.[active.col]) : undefined);

  const savedRows = useMemo(() => local.filter((l) => !isNewRow(l.row.id)).map((l) => l.row), [local]);
  // Worked out when rows change, not on every key typed.
  const filterColumns = useMemo(() => columns.filter((c) => c.filter).map((c) => ({ column: c, values: filterValues(savedRows, c.key) })), [columns, savedRows]);
  const shownSaved = visible.filter((l) => !isNewRow(l.row.id)).length;
  const sortTo = (key: string) => {
    setAdded([]);
    setSort((old) => (old?.key !== key ? { key, dir: 'asc' } : old.dir === 'asc' ? { key, dir: 'desc' } : null));
  };

  return (
    <div className="dg">
      <div className="dg-toolbar">
        <input
          ref={searchRef}
          className="dg-search"
          type="search"
          placeholder={props.searchPlaceholder ?? 'Search'}
          aria-label={`Search ${label}`}
          value={query}
          onChange={(e) => {
            setAdded([]);
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'Escape') {
              e.preventDefault();
              if (e.key === 'Escape') setQuery('');
              focusGrid();
              if (!active && keys.length) moveTo(keys[0], columns[0].key);
            }
          }}
        />
        {filterColumns.map(({ column: c, values }) => (
          <label key={c.key} className="dg-filter">
            {c.label}
            <select
              value={filters[c.key] ?? ''}
              onChange={(e) => {
                setAdded([]);
                setFilters((f) => ({ ...f, [c.key]: e.target.value }));
              }}
            >
              <option value="">All</option>
              {values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="dg-filter dg-sortsel">
          Sort
          <select
            value={sort ? `${sort.key}:${sort.dir}` : ''}
            onChange={(e) => {
              setAdded([]);
              const [key, dir] = e.target.value.split(':');
              setSort(key ? { key, dir: dir as 'asc' | 'desc' } : null);
            }}
          >
            <option value="">As listed</option>
            {columns.flatMap((c) => [
              <option key={`${c.key}:asc`} value={`${c.key}:asc`}>
                {c.label} ↑
              </option>,
              <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
                {c.label} ↓
              </option>,
            ])}
          </select>
        </label>
        <span className="dg-count">
          {shownSaved === savedRows.length ? `${savedRows.length} ${savedRows.length === 1 ? 'row' : 'rows'}` : `${shownSaved} of ${savedRows.length} shown`}
        </span>
        {save ? (
          <span className={`dg-save ${status.cls}`} role="status" aria-live="polite">
            <span className="dot" />
            {status.text}
          </span>
        ) : null}
      </div>

      {props.note ? (
        <label className="dg-note">
          <span>{props.note.label}</span>
          <input
            ref={noteRef}
            className="input"
            value={note}
            placeholder={props.note.placeholder}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Tab') {
                if (e.key === 'Enter') e.preventDefault();
                focusGrid();
                if (!active && keys.length) moveTo(keys[0], columns[0].key);
              }
            }}
          />
        </label>
      ) : null}

      {secret ? (
        <div className="notice warn" role="alert">
          <b>Write this down now.</b> It is shown only here, once: <span className="secret">{secret}</span>{' '}
          <button className="btn small secondary" type="button" onClick={() => setSecret(null)}>
            I have written it down
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="notice ok dg-notice" role="status">
          {notice}{' '}
          <button className="linkish" type="button" onClick={() => setNotice(null)}>
            Close
          </button>
        </div>
      ) : null}

      {actions.length || remove ? (
        <div className="dg-actions">
          <span className="sub">{activeKeyIsSaved ? `Selected: ${(props.rowName && activeRow!.cells[props.rowName]) || 'a row'}` : 'Select a row first'}</span>
          {actions.map((a) => (
            <button key={a.label} className="btn small secondary" type="button" disabled={!activeKeyIsSaved || busy} onClick={() => runAction(a)}>
              {a.label}
            </button>
          ))}
          {remove ? (
            <button className="btn small danger" type="button" disabled={!activeKeyIsSaved || busy} onClick={removeActive}>
              {props.removeLabel ?? 'Remove'} (Ctrl+Delete)
            </button>
          ) : null}
        </div>
      ) : null}

      {confirm ? (
        <div className="dg-bar" role="alert">
          <span>{confirm.text}</span>
          <button
            className="btn small"
            type="button"
            onClick={() => {
              const run = confirm.run;
              setConfirm(null);
              run();
            }}
          >
            Yes
          </button>
          <button className="btn small secondary" type="button" onClick={() => setConfirm(null)}>
            No
          </button>
        </div>
      ) : null}

      {plan ? (
        <div className="dg-bar" role="alert">
          <b>
            Paste from Excel: {plan.changes.length} cell{plan.changes.length === 1 ? '' : 's'} will change
            {plan.newRows.length ? ` and ${plan.newRows.length} row${plan.newRows.length === 1 ? '' : 's'} will be added` : ''}. The new values are highlighted below.
          </b>
          <button className="btn small" type="button" onClick={applyPlan}>
            Apply (Enter)
          </button>
          <button className="btn small secondary" type="button" onClick={() => setPlan(null)}>
            Cancel (Esc)
          </button>
          <ul>
            {plan.changes.slice(0, 8).map((c, i) => {
              const row = rowAt(localRef.current.find((l) => l.row.id === c.rowId)?.key ?? '');
              return (
                <li key={i}>
                  {(row && props.rowName && row.cells[props.rowName]) || 'Row'} · {columns[colIndex.get(c.key)!]?.label}: {c.from || 'blank'} → {c.to || 'blank'}
                </li>
              );
            })}
            {plan.changes.length > 8 ? <li>…and {plan.changes.length - 8} more changes.</li> : null}
            {plan.newRows.slice(0, 5).map((r, i) => (
              <li key={`n${i}`}>New row: {Object.values(r.cells).join(' · ')}</li>
            ))}
            {plan.newRows.length > 5 ? <li>…and {plan.newRows.length - 5} more new rows.</li> : null}
            {plan.problems.map((p, i) => (
              <li key={`p${i}`} className="dg-problem">
                {p}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        ref={gridRef}
        className="dg-grid"
        role="grid"
        aria-label={label}
        aria-rowcount={keys.length + 1}
        tabIndex={0}
        style={{ '--dg-cols': template } as React.CSSProperties}
        onKeyDown={onGridKey}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onPointerDown={(e) => (touch.current = e.pointerType === 'touch')}
        onFocus={(e) => {
          // Tabbing into the table lands on the first cell; a click has already chosen its cell, which this keeps.
          if (e.target !== gridRef.current || !keys.length) return;
          const first = { key: keys[0], col: columns[0].key };
          setActive((a) => a ?? first);
          setAnchor((a) => a ?? first);
        }}
      >
        <div className="dg-row dg-head" role="row">
          {columns.map((c) => (
            <div key={c.key} role="columnheader" className={`dg-th ${c.align ?? ''}`} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" tabIndex={-1} onClick={() => sortTo(c.key)} title={`Sort by ${c.label}`}>
                <span className="dg-label">{c.label}</span>
                <span className="dg-arrow">{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
              </button>
            </div>
          ))}
        </div>
        {visible.map((l) => (
          <GridRowView
            key={l.key}
            rowKey={l.key}
            row={l.row}
            columns={columns}
            activeCol={active?.key === l.key ? active.col : null}
            selCols={selectionCols(selection, keys.indexOf(l.key), columns)}
            editing={editing?.key === l.key ? editing : null}
            errors={errors.get(l.key)}
            rowError={rowErrors[l.key]}
            proposals={plan?.byCell.get(l.key)}
            api={api}
          />
        ))}
        {canAdd ? (
          <GridRowView
            rowKey={BLANK}
            row={BLANK_ROW}
            columns={columns}
            activeCol={active?.key === BLANK ? active.col : null}
            selCols={selectionCols(selection, keys.length - 1, columns)}
            editing={editing?.key === BLANK ? editing : null}
            placeholder={firstEditable ? { col: firstEditable, text: props.addHint ?? 'Type here to add a row' } : undefined}
            api={api}
          />
        ) : null}
        {!visible.length && !canAdd ? <div className="dg-empty">{local.length ? 'No rows match the search or filters.' : (props.emptyText ?? 'Nothing here yet.')}</div> : null}
      </div>

      <div className="dg-foot">
        {where ? (
          <span className={activeError ? 'dg-where err' : 'dg-where'}>
            {where}
            {activeInfo ? `: ${activeInfo}` : ''}
          </span>
        ) : (
          <span className="dg-where">{hint}</span>
        )}
        <span>
          {save ? 'Type to change a cell · Enter moves down, Tab moves right · F2 edits the text · Ctrl+V pastes from Excel' : 'Arrow keys move · Ctrl+C copies'}
          {canAdd ? ' · type in the last row to add' : ''}
          {remove ? ' · Ctrl+Delete removes the row' : ''} · Ctrl+F searches · click a heading to sort
        </span>
      </div>
    </div>
  );
}

const BLANK_ROW: GridRow = { id: BLANK, cells: {} };

function selectionCols(sel: [number, number, number, number] | null, r: number, columns: GridColumn[]): string | null {
  if (!sel || r < sel[0] || r > sel[1] || (sel[0] === sel[1] && sel[2] === sel[3])) return null;
  return columns
    .slice(sel[2], sel[3] + 1)
    .map((c) => c.key)
    .join('|');
}

type Api = React.RefObject<{
  down: (key: string, col: string, e: React.MouseEvent) => void;
  double: (key: string, col: string) => void;
  setText: (t: string, completes: boolean) => void;
  editorKey: (e: React.KeyboardEvent<HTMLInputElement>, s: GridOption[]) => void;
  editorBlur: () => void;
  editorPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  pick: (o: GridOption) => void;
  options: (c: GridColumn, key: string) => GridOption[];
}>;

const GridRowView = memo(function GridRowView(p: {
  rowKey: string;
  row: GridRow;
  columns: GridColumn[];
  activeCol: string | null;
  selCols: string | null;
  editing: Editing | null;
  errors?: Record<string, string>;
  rowError?: string;
  proposals?: Record<string, string>;
  placeholder?: { col: string; text: string };
  api: Api;
}) {
  const selected = p.selCols ? new Set(p.selCols.split('|')) : null;
  const isBlank = p.rowKey === BLANK;
  return (
    <div className={`dg-row${isBlank ? ' dg-blank' : ''}${p.rowError ? ' row-err' : ''}${!isBlank && isNewRow(p.row.id) ? ' dg-new' : ''}`} role="row">
      {p.columns.map((c) => {
        const editable = canEditCell(c, isBlank ? null : p.row);
        const proposed = p.proposals?.[c.key];
        const err = p.errors?.[c.key];
        const tone = p.row.tones?.[c.key];
        const cls = [
          'dg-cell',
          c.align ?? '',
          editable ? 'ed' : 'ro',
          p.activeCol === c.key ? 'active' : '',
          selected?.has(c.key) ? 'sel' : '',
          err ? 'err' : '',
          proposed !== undefined ? 'proposed' : '',
          tone ? `tone-${tone}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        const text = proposed !== undefined ? proposed : (p.row.cells[c.key] ?? '');
        const href = p.row.links?.[c.key];
        const isEditing = p.editing?.col === c.key;
        return (
          <div
            key={c.key}
            role="gridcell"
            className={cls}
            data-k={p.rowKey}
            data-c={c.key}
            data-label={c.label}
            aria-selected={p.activeCol === c.key}
            aria-readonly={!editable}
            title={err ?? (proposed !== undefined ? `Was: ${p.row.cells[c.key] || 'blank'}` : undefined)}
            onMouseDown={(e) => p.api.current.down(p.rowKey, c.key, e)}
            onDoubleClick={() => p.api.current.double(p.rowKey, c.key)}
          >
            <span className="dg-v">
              {isEditing ? (
                <CellEditor column={c} editing={p.editing!} rowKey={p.rowKey} api={p.api} />
              ) : href && text ? (
                <a href={href} tabIndex={-1}>
                  {text}
                </a>
              ) : text ? (
                text
              ) : p.placeholder?.col === c.key ? (
                <span className="dg-ph">{p.placeholder.text}</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
});

function CellEditor({ column, editing, rowKey, api }: { column: GridColumn; editing: Editing; rowKey: string; api: Api }) {
  const ref = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Like text spilling across cells in Excel, the box widens over its neighbours to show all it holds, and it and the
  // list under it stay inside the table so nothing is cut off and the page never scrolls sideways.
  useLayoutEffect(() => {
    const el = ref.current;
    const cell = el?.parentElement;
    const grid = el?.closest<HTMLElement>('.dg-grid');
    if (!el || !cell || !grid) return;
    const room = grid.getBoundingClientRect();
    const box = cell.getBoundingClientRect();
    const inner = room.width - 2;
    el.style.width = '';
    el.style.left = '';
    const width = Math.min(Math.max(box.width, el.scrollWidth + 4), inner);
    el.style.width = `${width}px`;
    const over = box.left + width - (room.right - 1);
    if (over > 0) el.style.left = `${-Math.min(over, box.left - room.left - 1)}px`;
    el.scrollLeft = 0;
    const list = listRef.current;
    if (!list) return;
    list.style.left = '';
    list.style.maxWidth = `${Math.min(inner, 440)}px`;
    const past = list.getBoundingClientRect().right - (room.right - 1);
    if (past > 0) list.style.left = `${-Math.min(past, box.left - room.left - 1)}px`;
  }, [editing.text, editing.index]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(editing.start, editing.end);
    // Only when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A completed match is shown selected, so typing on replaces it, as in Excel.
  useLayoutEffect(() => {
    if (editing.start !== editing.end) ref.current?.setSelectionRange(editing.start, editing.end);
  }, [editing.text, editing.start, editing.end]);
  const matches = column.type === 'choice' ? completionMatches(editing.typed, api.current.options(column, rowKey)) : [];
  // The list under the cell shows eight matches, moving along with Down and Up.
  const from = Math.max(0, editing.index - 7);
  const shown = matches.slice(from, from + 8);
  const typed = editing.typed.trim();
  const newHint = column.newHint && typed && !matches.length ? column.newHint.replace('{text}', typed) : null;
  return (
    <>
      <input
        ref={ref}
        className="dg-input"
        value={editing.text}
        aria-label={column.label}
        autoComplete="off"
        spellCheck={false}
        inputMode={column.type === 'number' ? 'decimal' : undefined}
        onChange={(e) => {
          const el = e.target;
          const kind = (e.nativeEvent as InputEvent).inputType;
          const inserted = kind ? kind.startsWith('insert') : el.value.length > editing.typed.length;
          api.current.setText(el.value, inserted && el.selectionEnd === el.value.length);
        }}
        onKeyDown={(e) => api.current.editorKey(e, matches)}
        onBlur={() => api.current.editorBlur()}
        onPaste={(e) => api.current.editorPaste(e)}
        onMouseDown={(e) => e.stopPropagation()}
      />
      {shown.length || newHint ? (
        <ul ref={listRef} className="dg-suggest" role="listbox" aria-label={`${column.label} choices`}>
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={from + i === editing.index}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                api.current.pick(o);
              }}
            >
              {o.label}
              {o.hint ? <span>{o.hint}</span> : null}
            </li>
          ))}
          {newHint ? (
            <li aria-selected={false} className="dg-new-opt">
              {newHint}
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}

// Rows of the coordinator's spreadsheet tables (components/DataGrid.tsx). A page's first load and every save build
// rows with the same functions, so a saved row always reads exactly like a freshly loaded one.

import type { GridRow } from './grid';
import { rollName, type EventRow, type GroupRow, type StudentRow } from './repo';
import { fmt2, round2, type GroupResult } from './scoring';

type EventLike = Pick<EventRow, 'id' | 'released_at'>;

export const RELEASED_NOTHING = 'Results have been released; this can no longer change.';

export function groupGridRow(event: EventLike, g: GroupRow): GridRow {
  const href = `/admin/events/${event.id}/groups/${g.id}`;
  return {
    id: g.id,
    cells: { code: g.code, name: g.name, section: g.section, adviser: g.adviser_name ?? '', members: String(g.member_count) },
    links: { name: href, members: href },
    tones: g.member_count ? undefined : { members: 'err' },
    locked: event.released_at ? { section: 'Results have been released, so the section cannot change now. The code, name and adviser can still be corrected.' } : undefined,
  };
}

/** A group's line in the Results table: each category's percentage with its rank, then the overall and its rank. */
export function resultGridRow(event: EventLike, g: GroupRow, r: GroupResult): GridRow {
  const cells: Record<string, string> = { group: `${g.code} ${g.name}`, section: g.section, adviser: g.adviser_name ?? '' };
  const sort: Record<string, number | null> = {};
  const tones: GridRow['tones'] = {};
  for (const c of r.categories) {
    const key = `c:${c.key}`;
    cells[key] = c.pct === null ? '—' : c.rank !== null ? `${fmt2(c.pct)} · ${c.rank}` : `${fmt2(c.pct)} · incomplete`;
    sort[key] = c.pct === null ? null : round2(c.pct);
    if (c.pct !== null && c.rank === null) tones[key] = 'muted';
  }
  const ranked = r.complete || r.accepted;
  cells.overall = r.overall === null ? '—' : fmt2(r.overall);
  sort.overall = r.overall === null ? null : round2(r.overall);
  if (!ranked) tones.overall = 'muted';
  cells.rank = r.overallRank === null ? '' : String(r.overallRank);
  cells.judged = r.complete ? 'Complete' : r.accepted ? 'Accepted' : 'Incomplete';
  tones.judged = r.complete ? 'ok' : 'warn';
  return {
    id: g.id,
    cells,
    sort,
    tones,
    links: { group: `/admin/events/${event.id}/groups/${g.id}` },
    notes: r.accepted ? { judged: `Finalised without every score, with your reason: ${g.accept_reason}` } : !ranked ? { overall: 'Incomplete: from what is scored so far, so it has no rank.' } : undefined,
  };
}

export const PRESENCE = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
];

export function memberGridRow(event: EventLike, m: StudentRow): GridRow {
  return {
    id: m.id,
    cells: { student: m.student_number, name: rollName(m), section: m.section, email: m.email, absent: m.absent_at ? 'Absent' : 'Present' },
    tones: m.absent_at ? { absent: 'warn' } : undefined,
    notes: m.absent_at ? { absent: 'Absent from the defense: no grade from the app; you enter it yourself.' } : undefined,
    locked: event.released_at ? { absent: RELEASED_NOTHING } : undefined,
  };
}

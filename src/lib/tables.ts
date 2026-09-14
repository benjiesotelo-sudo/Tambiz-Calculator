// Rows of the coordinator's spreadsheet tables (components/DataGrid.tsx). A page's first load and every save build
// rows with the same functions, so a saved row always reads exactly like a freshly loaded one.

import type { GridRow } from './grid';
import { rollName, type EventRow, type GradeRow, type groupScoreDetail, type GroupRow, type StudentRow } from './repo';
import { criterionLabel, type Half } from './rubric';
import { fmt2, round2, type GroupResult } from './scoring';
import { fmtScore } from './sheet';

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

/** A student on the Class roll table, with their group and whether they were left out. */
export function rollGridRow(event: EventLike, s: StudentRow): GridRow {
  const inGroup = !!s.group_id;
  const status = inGroup ? 'In a group' : s.excluded_reason ? 'Left out' : 'Not in a group';
  const locked: Record<string, string> = {};
  if (event.released_at) {
    locked.group = 'Results have been released, so a student cannot change group now.';
    locked.leftout = RELEASED_NOTHING;
  } else if (inGroup) locked.leftout = 'This student is in a group. Clear their Group first to leave them out.';
  return {
    id: s.id,
    cells: {
      student: s.student_number,
      surname: s.surname,
      first: s.first_name,
      middle: s.middle_name,
      section: s.section,
      email: s.email,
      group: s.group_code ?? '',
      status,
      leftout: inGroup ? '' : (s.excluded_reason ?? ''),
    },
    links: s.group_id ? { group: `/admin/events/${event.id}/groups/${s.group_id}` } : undefined,
    tones: { status: inGroup ? 'ok' : s.excluded_reason ? 'muted' : 'err' },
    locked: Object.keys(locked).length ? locked : undefined,
    notes: !inGroup && !s.excluded_reason ? { status: 'Judging cannot close until this student is in a group or left out with a reason.' } : undefined,
  };
}

export interface AdviserListRow {
  id: string;
  name: string;
  name_key: string;
  email: string;
  link_code: string;
  group_count: number;
}

export function adviserGridRow(a: AdviserListRow): GridRow {
  return {
    id: a.id,
    cells: { name: a.name, email: a.email, code: a.link_code, groups: String(a.group_count) },
    tones: a.group_count ? undefined : { groups: 'muted' },
    notes: { code: a.link_code ? 'The adviser types this to open their link. Hand it to them yourself; it is never in the email.' : 'No code yet, so this adviser gets no link.' },
  };
}

export function judgeGridRow(eventId: string, j: { id: string; email: string; display_name: string }): GridRow {
  return {
    id: j.id,
    cells: { name: j.display_name, login: j.email, profile: 'Profile' },
    links: { profile: `/admin/events/${eventId}/profiles/${j.id}` },
    notes: { login: 'What the judge types to sign in. Changing it keeps their password.' },
  };
}

export function departmentGridRow(j: { id: string; email: string; display_name: string; events: number }): GridRow {
  return { id: j.id, cells: { name: j.display_name, login: j.email, events: String(j.events) } };
}

type ScoreDetail = Awaited<ReturnType<typeof groupScoreDetail>>;
const showScore = (v: number | null) => (v === null ? 'no score' : fmtScore(v));

/**
 * One score box on a group's scores table: a criterion, or one member's field, with every judge's value in its own
 * column (keyed by sheet id) and the average of the submitted sheets. Null for a key that is not on this sheet.
 */
export function scoreGridRow(event: EventRow, half: Half, detail: ScoreDetail, members: StudentRow[], key: string): GridRow | null {
  const [kind, a, b] = key.split(':');
  let item: string;
  let category: string;
  let max: number;
  let absent = false;
  if (kind === 'c') {
    const cat = event.rubric.halves[half].categories.find((c) => c.key === a);
    const i = Number(b);
    if (!cat || !(i >= 0 && i < cat.maxes.length)) return null;
    category = cat.name;
    item = `${i + 1}. ${criterionLabel(cat, i)}`;
    max = cat.maxes[i];
  } else {
    const member = members.find((m) => m.id === a);
    const field = event.rubric.memberFields.find((f) => f.key === b);
    if (kind !== 'm' || half !== 'defense' || !member || !field) return null;
    category = `${member.first_name} ${member.surname}`;
    item = field.name;
    max = field.max;
    absent = !!member.absent_at;
  }
  const cells: Record<string, string> = { category, item, max: String(max) };
  const tones: NonNullable<GridRow['tones']> = {};
  const notes: Record<string, string> = {};
  const locked: Record<string, string> = {};
  const counted: number[] = [];
  for (const sh of detail.sheets) {
    const stored = detail.scores.get(sh.id)?.get(key);
    const removed = stored ? undefined : detail.removed.get(sh.id)?.get(key);
    cells[sh.id] = stored ? fmtScore(stored.value) : '';
    if (stored && sh.status === 'complete') counted.push(stored.value);
    const status = sh.status === 'complete' ? '' : ` ${sh.judge_name} has not submitted this sheet, so its scores do not count yet.`;
    if (stored?.correctedByName) {
      tones[sh.id] = 'corrected';
      notes[sh.id] = `Corrected by ${stored.correctedByName}. The judge gave ${showScore(stored.judgeValue)}. Reason: ${stored.reason}.${status}`;
    } else if (removed) {
      tones[sh.id] = 'corrected';
      notes[sh.id] = `Corrected to blank. The judge gave ${showScore(removed.judgeValue)}. Reason: ${removed.reason}.${status}`;
    } else if (status) {
      tones[sh.id] = 'muted';
      notes[sh.id] = status.trim();
    } else if (absent) notes[sh.id] = 'Absent from the defense: needs no member scores.';
    if (event.released_at) locked[sh.id] = 'Results have been released, so scores can no longer be corrected.';
  }
  cells.avg = counted.length ? fmt2(counted.reduce((x, y) => x + y, 0) / counted.length) : '';
  return { id: key, cells, tones, notes, locked: Object.keys(locked).length ? locked : undefined, max };
}

/** Every score box of a group's half, in sheet order, then each member's three fields. */
export function scoreGridRows(event: EventRow, half: Half, detail: ScoreDetail, members: StudentRow[]): GridRow[] {
  const keys = [
    ...event.rubric.halves[half].categories.flatMap((c) => c.maxes.map((_, i) => `c:${c.key}:${i}`)),
    ...(half === 'defense' ? members.flatMap((m) => event.rubric.memberFields.map((f) => `m:${m.id}:${f.key}`)) : []),
  ];
  return keys.map((k) => scoreGridRow(event, half, detail, members, k)).filter((r): r is GridRow => r !== null);
}

/** A student on the Grades table. */
export function gradeGridRow(event: EventLike, g: GradeRow): GridRow {
  const why = g.absent
    ? 'Absent from the defense: the app gives no grade; enter it yourself. The workbook leaves it blank with a note.'
    : [!g.memberComplete ? 'member scores incomplete' : '', !g.groupReady ? 'group not fully judged' : ''].filter(Boolean).join(' and ');
  const status = g.letter ? 'Graded' : g.absent ? 'Absent' : 'No grade yet';
  return {
    id: g.student.id,
    cells: {
      student: g.student.student_number,
      name: rollName(g.student),
      section: g.student.section,
      group: `${g.group.code} ${g.group.name}`,
      adviser: g.group.adviser_name ?? '',
      total: g.total === null ? '' : fmt2(g.total),
      overall: g.overall === null ? '' : fmt2(g.overall),
      final: g.final === null ? '' : fmt2(g.final),
      rounded: g.rounded === null ? '' : String(g.rounded),
      letter: g.letter ?? '',
      qp: g.qualityPoints === null ? '' : String(g.qualityPoints),
      absent: g.absent ? 'Absent' : 'Present',
      status,
    },
    links: { group: `/admin/events/${event.id}/groups/${g.group.id}` },
    tones: {
      status: g.letter ? 'ok' : g.absent ? 'warn' : 'err',
      ...(g.total !== null && !g.memberComplete ? { total: 'muted' as const } : {}),
      ...(g.overall !== null && !g.groupReady ? { overall: 'muted' as const } : {}),
      ...(g.absent ? { absent: 'warn' as const } : {}),
      ...(g.letter === 'F' ? { letter: 'err' as const } : {}),
    },
    notes: {
      ...(g.letter ? {} : { status: g.absent ? why : `No grade because: ${why}.` }),
      ...(g.perJudge.length ? { total: g.perJudge.map((p) => `${p.judge}: ${[p.set.presentation, p.set.communication, p.set.qa].map((v) => v ?? '–').join(' / ')}`).join(' · ') } : {}),
    },
    locked: event.released_at ? { absent: RELEASED_NOTHING } : undefined,
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

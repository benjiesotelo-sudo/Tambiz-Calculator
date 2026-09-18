// Rows of the coordinator's spreadsheet tables (components/DataGrid.tsx). A page's first load and every save build
// rows with the same functions, so a saved row always reads exactly like a freshly loaded one.

import { LOCKED_CLOSED, LOCKED_SENT } from './locks';
import type { GridRow } from './grid';
import { rollName, type DataRow, type EventRow, type GradeRow, type groupScoreDetail, type GroupRow, type StudentRow } from './repo';
import { criterionLabel, type Half } from './rubric';
import { fmt2, round2, type GroupResult } from './scoring';
import { fmtScore } from './sheet';

type EventLike = Pick<EventRow, 'id' | 'released_at' | 'status'>;

/** Where a group's scores are seen and corrected. */
export const scoresHref = (eventId: string, groupId: string, half = 'defense') => `/admin/events/${eventId}/scores/${groupId}?half=${half}`;

/** A group's line in the Results table: each category's percentage with its rank, then the overall and its rank. */
export function resultGridRow(event: EventLike, g: GroupRow, r: GroupResult): GridRow {
  const cells: Record<string, string> = { group: g.name, adviser: g.adviser_name ?? '' };
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
    links: { group: scoresHref(event.id, g.id) },
    lead: r.overallRank === 1,
    notes: r.accepted ? { judged: `Finalised without every score, with your reason: ${g.accept_reason}` } : !ranked ? { overall: 'Incomplete: from what is scored so far, so it has no rank.' } : undefined,
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

/**
 * A student on the Data table, with their group and its adviser. Changing a student's Adviser or Adviser email changes
 * it for the whole group (a group has one adviser), so those rows come back too.
 */
export function dataGridRow(event: EventLike, s: DataRow): GridRow {
  const locked: Record<string, string> = {};
  if (event.released_at) for (const k of DATA_KEYS) locked[k] = LOCKED_SENT;
  else if (event.status === 'finalised') for (const k of ['group', 'adviser']) locked[k] = LOCKED_CLOSED;
  const notes: Record<string, string> = {};
  if (s.adviser_name && !s.adviser_email) notes.adviserEmail = `${s.adviser_name} has no email, so gets no results email.`;
  if (!s.section) notes.section = 'No section. Judging does not need it, but the For Encoding grade sheet cannot be organised by section without it.';
  if (!s.group_id) notes.group = 'In no group, so this student gets no grade. Type their group.';
  return {
    id: s.id,
    cells: {
      student: s.student_number,
      surname: s.surname,
      first: s.first_name,
      middle: s.middle_name,
      section: s.section,
      email: s.email,
      group: s.group_name ?? '',
      adviser: s.adviser_name ?? '',
      adviserEmail: s.adviser_email ?? '',
    },
    tones: { ...(s.group_id ? {} : { group: 'err' as const }), ...(s.adviser_name && !s.adviser_email ? { adviserEmail: 'warn' as const } : {}) },
    links: s.group_id ? { group: scoresHref(event.id, s.group_id) } : undefined,
    locked: Object.keys(locked).length ? locked : undefined,
    notes: Object.keys(notes).length ? notes : undefined,
  };
}

export const DATA_KEYS = ['student', 'surname', 'first', 'middle', 'section', 'email', 'group', 'adviser', 'adviserEmail'];

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
    } else if (absent) notes[sh.id] = 'Absent from the defense: a score left blank counts as zero. Type a score to give them one.';
    if (event.released_at) locked[sh.id] = LOCKED_SENT;
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
  const why = [!g.memberComplete ? 'individual scores incomplete' : '', !g.groupReady ? 'group not fully judged' : ''].filter(Boolean).join(' and ');
  const status = g.letter ? 'Graded' : 'No grade yet';
  return {
    id: g.student.id,
    cells: {
      student: g.student.student_number,
      name: rollName(g.student),
      section: g.student.section,
      group: g.group.name,
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
    links: { group: scoresHref(event.id, g.group.id) },
    tones: {
      status: g.letter ? 'ok' : 'err',
      ...(g.total !== null && !g.memberComplete ? { total: 'muted' as const } : {}),
      ...(g.overall !== null && !g.groupReady ? { overall: 'muted' as const } : {}),
      ...(g.absent ? { absent: 'warn' as const } : {}),
      ...(g.letter === 'F' ? { letter: 'err' as const } : {}),
    },
    notes: {
      ...(g.letter ? {} : { status: `No grade because: ${why}.` }),
      ...(g.absent ? { absent: 'Absent from the defense: individual scores nobody gave count as zero. To change the grade, correct their individual scores on the group’s scores page.' } : {}),
      ...(g.perJudge.length ? { total: g.perJudge.map((p) => `${p.judge}: ${[p.set.presentation, p.set.communication, p.set.qa].map((v) => v ?? '–').join(' / ')}`).join(' · ') } : {}),
    },
    locked: event.released_at ? { absent: LOCKED_SENT } : undefined,
  };
}

export const PRESENCE = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
];

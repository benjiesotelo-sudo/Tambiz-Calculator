// Reads shared by pages, actions and the export. All SQL outside db.ts, auth.ts and seed.ts lives here or in actions.

import { removedByCoordinator, type CorrectionLogEntry, type RemovedScore } from './corrections';
import { one, query } from './db';
import { finaliseChecks } from './finalise';
import { criteriaOf, DEFAULT_RUBRIC, HALVES, type Half, type MemberFieldKey, type Rubric } from './rubric';
import { computeResults, finalGrade, letterGrade, memberScore, type EventResults, type MemberSet, type ScoredGroup, type SheetValues } from './scoring';

export interface EventRow {
  id: string;
  year: number;
  title: string;
  status: 'setup' | 'judging' | 'finalised';
  rubric: Rubric;
  created_at: Date;
  /** Results released to students and advisers; only possible once finalised. Nothing can be corrected after. */
  released_at?: Date | null;
}

export interface GroupRow {
  id: string;
  event_id: string;
  code: string;
  name: string;
  section: string;
  adviser_id: string | null;
  adviser_name: string | null;
  member_count: number;
  /** Set when the coordinator finalised this group without every score (decision 5). */
  accept_reason?: string | null;
}

export interface StudentRow {
  id: string;
  student_number: string;
  email: string;
  surname: string;
  first_name: string;
  middle_name: string;
  section: string;
  group_id?: string | null;
  group_code?: string | null;
  group_name?: string | null;
  /** Set when the coordinator left this student out of every group, with this reason (decision 6). */
  excluded_reason?: string | null;
  /** Only from groupMembers: marked absent from the defense. */
  absent_at?: Date | null;
}

const parseRubric = (r: unknown): Rubric => (typeof r === 'string' ? JSON.parse(r) : (r as Rubric)) ?? DEFAULT_RUBRIC;

export async function listEvents() {
  const rows = await query<EventRow>('SELECT * FROM event ORDER BY year DESC, created_at DESC');
  return rows.map((e) => ({ ...e, rubric: parseRubric(e.rubric) }));
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const e = await one<EventRow>('SELECT * FROM event WHERE id = $1', [id]);
  return e ? { ...e, rubric: parseRubric(e.rubric) } : null;
}

/** The newest event this judge is assigned to. */
export async function eventForJudge(accountId: string): Promise<EventRow | null> {
  const e = await one<EventRow>(
    'SELECT e.* FROM event e JOIN event_judge j ON j.event_id = e.id WHERE j.account_id = $1 ORDER BY e.year DESC, e.created_at DESC LIMIT 1',
    [accountId],
  );
  return e ? { ...e, rubric: parseRubric(e.rubric) } : null;
}

export async function listGroups(eventId: string) {
  const rows = await query<GroupRow>(
    `SELECT g.*, a.name AS adviser_name, (SELECT count(*)::int FROM group_member m WHERE m.group_id = g.id) AS member_count
     FROM tgroup g LEFT JOIN adviser a ON a.id = g.adviser_id WHERE g.event_id = $1`,
    [eventId],
  );
  return rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export async function getGroup(eventId: string, groupId: string) {
  return one<GroupRow>(
    `SELECT g.*, a.name AS adviser_name, 0 AS member_count FROM tgroup g LEFT JOIN adviser a ON a.id = g.adviser_id WHERE g.event_id = $1 AND g.id = $2`,
    [eventId, groupId],
  );
}

export async function groupMembers(groupId: string) {
  return query<StudentRow>(
    `SELECT s.*, m.absent_at FROM group_member m JOIN student s ON s.id = m.student_id WHERE m.group_id = $1 ORDER BY s.surname, s.first_name`,
    [groupId],
  );
}

export async function listStudents(eventId: string) {
  return query<StudentRow>(
    `SELECT s.*, g.id AS group_id, g.code AS group_code, g.name AS group_name FROM student s
     LEFT JOIN group_member m ON m.student_id = s.id LEFT JOIN tgroup g ON g.id = m.group_id
     WHERE s.event_id = $1 ORDER BY s.section, s.surname, s.first_name`,
    [eventId],
  );
}

export async function listAdvisers(eventId: string) {
  return query<{ id: string; name: string; email: string; link_code: string; group_count: number }>(
    `SELECT a.*, (SELECT count(*)::int FROM tgroup g WHERE g.adviser_id = a.id) AS group_count FROM adviser a WHERE a.event_id = $1 ORDER BY a.name`,
    [eventId],
  );
}

export async function eventJudges(eventId: string) {
  return query<{ id: string; email: string; display_name: string; disabled_at: Date | null }>(
    `SELECT a.id, a.email, a.display_name, a.disabled_at FROM event_judge j JOIN account a ON a.id = j.account_id WHERE j.event_id = $1 ORDER BY a.display_name`,
    [eventId],
  );
}

/** The department's standing list of judges who are not yet judging this event, with how many events each has judged. */
export async function departmentJudges(eventId: string) {
  return query<{ id: string; email: string; display_name: string; events: number }>(
    `SELECT a.id, a.email, a.display_name, (SELECT count(*)::int FROM event_judge j WHERE j.account_id = a.id) AS events
     FROM account a WHERE a.role = 'judge' AND NOT EXISTS (SELECT 1 FROM event_judge j WHERE j.account_id = a.id AND j.event_id = $1)
     ORDER BY a.display_name`,
    [eventId],
  );
}

export const fullName =(s: Pick<StudentRow, 'first_name' | 'surname'>) => `${s.first_name} ${s.surname}`;
export const rollName = (s: Pick<StudentRow, 'first_name' | 'surname' | 'middle_name'>) =>
  `${s.surname.toUpperCase()}, ${s.first_name}${s.middle_name ? ' ' + s.middle_name : ''}`;

export interface SheetRow {
  id: string;
  group_id: string;
  half: Half;
  judge_id: string;
  judge_name: string;
  status: 'in_progress' | 'complete';
}

/** Scores the coordinator removed and nobody has entered since, from the change log (corrections.ts). Optionally for some sheets only. */
export async function removedScores(eventId: string, sheetIds?: string[]) {
  const rows = await query<{ action: string; created_at: Date; who: string | null; detail: CorrectionLogEntry['detail'] }>(
    `SELECT c.action, c.created_at, a.display_name AS who, c.detail FROM change_log c LEFT JOIN account a ON a.id = c.account_id
     WHERE c.event_id = $1 AND c.action IN ('score.correct', 'scores') AND ($2::text[] IS NULL OR c.detail->>'sheet' = ANY($2::text[]))
       AND c.detail->>'sheet' IN (SELECT r.detail->>'sheet' FROM change_log r WHERE r.event_id = $1 AND r.action = 'score.correct' AND r.detail->>'to' IS NULL)
     ORDER BY c.created_at, c.id`,
    [eventId, sheetIds ?? null],
  );
  return removedByCoordinator(rows.map((r) => ({ action: r.action, createdAt: r.created_at, who: r.who, detail: r.detail })));
}

export type Correction = { key: string; value: number | null; judgeValue: number | null; reason: string };

/** Every sheet, value and member score of an event, shaped for the scoring functions. */
export async function loadEventScores(event: EventRow) {
  const [sheets, values, members, removed] = await Promise.all([
    query<SheetRow>(
      `SELECT s.id, s.group_id, s.half, s.judge_id, s.status, a.display_name AS judge_name FROM score_sheet s JOIN account a ON a.id = s.judge_id WHERE s.event_id = $1 ORDER BY a.display_name`,
      [event.id],
    ),
    query<{ sheet_id: string; criterion_key: string; value: number; corrected: boolean; judge_value: number | null; correction_reason: string | null }>(
      `SELECT v.sheet_id, v.criterion_key, v.value, v.corrected_by IS NOT NULL AS corrected, v.judge_value, v.correction_reason
       FROM score_value v JOIN score_sheet s ON s.id = v.sheet_id WHERE s.event_id = $1`,
      [event.id],
    ),
    query<{ sheet_id: string; student_id: string; field: MemberFieldKey; value: number; corrected: boolean; judge_value: number | null; correction_reason: string | null }>(
      `SELECT v.sheet_id, v.student_id, v.field, v.value, v.corrected_by IS NOT NULL AS corrected, v.judge_value, v.correction_reason
       FROM member_score v JOIN score_sheet s ON s.id = v.sheet_id WHERE s.event_id = $1`,
      [event.id],
    ),
    removedScores(event.id),
  ]);
  /** Coordinator corrections per sheet, keyed like the phone (c:… or m:…); a removed score has value null. */
  const corrections = new Map<string, Correction[]>();
  const addCorrection = (sheetId: string, c: Correction) => corrections.set(sheetId, [...(corrections.get(sheetId) ?? []), c]);
  const noteCorrection = (sheetId: string, key: string, v: { value: number; corrected: boolean; judge_value: number | null; correction_reason: string | null }) => {
    if (!v.corrected) return;
    addCorrection(sheetId, { key, value: Number(v.value), judgeValue: v.judge_value === null ? null : Number(v.judge_value), reason: v.correction_reason ?? '' });
  };
  values.forEach((v) => noteCorrection(v.sheet_id, `c:${v.criterion_key}`, v));
  members.forEach((m) => noteCorrection(m.sheet_id, `m:${m.student_id}:${m.field}`, m));
  const stored = new Set([...values.map((v) => `${v.sheet_id}|c:${v.criterion_key}`), ...members.map((m) => `${m.sheet_id}|m:${m.student_id}:${m.field}`)]);
  for (const [sheetId, byKey] of removed) {
    for (const [key, r] of byKey) {
      if (!stored.has(`${sheetId}|${key}`)) addCorrection(sheetId, { key, value: null, judgeValue: r.judgeValue, reason: r.reason });
    }
  }

  const sheetValues = new Map<string, SheetValues>();
  for (const sh of sheets) {
    sheetValues.set(sh.id, Object.fromEntries(event.rubric.halves[sh.half].categories.map((c) => [c.key, c.maxes.map(() => null)])));
  }
  const filled = new Map<string, number>();
  for (const v of values) {
    const sv = sheetValues.get(v.sheet_id);
    const [cat, i] = v.criterion_key.split(':');
    if (sv?.[cat] && +i < sv[cat].length) {
      sv[cat][+i] = Number(v.value);
      filled.set(v.sheet_id, (filled.get(v.sheet_id) ?? 0) + 1);
    }
  }
  // memberSets: student id → judge sheet id → the three fields
  const memberSets = new Map<string, Map<string, MemberSet>>();
  for (const m of members) {
    let byJudge = memberSets.get(m.student_id);
    if (!byJudge) memberSets.set(m.student_id, (byJudge = new Map()));
    const set = byJudge.get(m.sheet_id) ?? {};
    set[m.field] = Number(m.value);
    byJudge.set(m.sheet_id, set);
  }
  return { sheets, sheetValues, filled, memberSets, corrections };
}

export interface GradeRow {
  student: StudentRow;
  group: GroupRow;
  /** Marked absent from the defense: no grade from the app; the coordinator enters it (decision 6). */
  absent: boolean;
  perJudge: { judge: string; set: MemberSet }[];
  total: number | null;
  /** Every member field has at least one defense judge's score. */
  memberComplete: boolean;
  overall: number | null;
  /** The group is fully judged, or the coordinator accepted it at finalising. */
  groupReady: boolean;
  final: number | null;
  letter: string | null;
  rounded: number | null;
  qualityPoints: number | null;
}

export interface EventReport {
  event: EventRow;
  groups: GroupRow[];
  results: EventResults;
  resultById: Map<string, EventResults['groups'][number]>;
  grades: GradeRow[];
  sheets: SheetRow[];
  sheetValues: Map<string, SheetValues>;
  filled: Map<string, number>;
  corrections: Map<string, Correction[]>;
  /** Students on the roll deliberately left out of every group, with the coordinator's reason. */
  excluded: StudentRow[];
}

/** Results, leaderboards and individual grades for a whole event, computed live from the stored scores. */
export async function eventReport(event: EventRow): Promise<EventReport> {
  const [groups, scores, excluded, memberRows] = await Promise.all([
    listGroups(event.id),
    loadEventScores(event),
    query<StudentRow>(
      `SELECT s.* FROM student s WHERE s.event_id = $1 AND s.excluded_reason IS NOT NULL AND NOT EXISTS (SELECT 1 FROM group_member m WHERE m.student_id = s.id)
       ORDER BY s.section, s.surname, s.first_name`,
      [event.id],
    ),
    query<StudentRow & { group_id: string; absent_at: Date | null }>(
      `SELECT s.*, m.group_id, m.absent_at FROM group_member m JOIN student s ON s.id = m.student_id WHERE m.event_id = $1 ORDER BY s.surname, s.first_name`,
      [event.id],
    ),
  ]);
  const scored: ScoredGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    accepted: !!g.accept_reason,
    defense: scores.sheets.filter((s) => s.group_id === g.id && s.half === 'defense').map((s) => scores.sheetValues.get(s.id)!),
    booth: scores.sheets.filter((s) => s.group_id === g.id && s.half === 'booth').map((s) => scores.sheetValues.get(s.id)!),
  }));
  const results = computeResults(event.rubric, scored);
  const resultById = new Map(results.groups.map((r) => [r.id, r]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const sheetById = new Map(scores.sheets.map((s) => [s.id, s]));

  const grades: GradeRow[] = memberRows.map((st) => {
    const group = groupById.get(st.group_id)!;
    const byJudge = scores.memberSets.get(st.id) ?? new Map<string, MemberSet>();
    // Only sheets from this student's current group's defense count.
    const perJudge = [...byJudge.entries()]
      .map(([sheetId, set]) => ({ sheet: sheetById.get(sheetId), set }))
      .filter((x) => x.sheet && x.sheet.group_id === st.group_id && x.sheet.half === 'defense')
      .map((x) => ({ judge: x.sheet!.judge_name, set: x.set }));
    const member = memberScore(perJudge.map((p) => p.set), event.rubric.memberFields);
    const result = resultById.get(group.id);
    const overall = result?.overall ?? null;
    const groupReady = !!result && (result.complete || result.accepted);
    const absent = !!st.absent_at;
    // No grade from incomplete scores: a missing member field or an unjudged part of the group is never a zero.
    // A member absent from the defense gets no grade from the app at all; the coordinator enters it.
    const final = absent ? null : finalGrade(member.complete ? member.total : null, groupReady ? overall : null);
    const lg = letterGrade(final, event.rubric.grades);
    return {
      student: st,
      group,
      absent,
      perJudge,
      total: member.total,
      memberComplete: member.complete,
      overall,
      groupReady,
      final,
      letter: lg?.letter ?? null,
      rounded: lg?.rounded ?? null,
      qualityPoints: lg?.qualityPoints ?? null,
    };
  });

  return {
    event,
    groups,
    results,
    resultById,
    grades,
    sheets: scores.sheets,
    sheetValues: scores.sheetValues,
    filled: scores.filled,
    corrections: scores.corrections,
    excluded,
  };
}

/** The finalise checklist (decisions 5 and 6) for an event's current report. */
export async function eventFinaliseChecks(report: EventReport) {
  const { event } = report;
  const students = await listStudents(event.id);
  return finaliseChecks({
    halfLabel: { defense: event.rubric.halves.defense.label, booth: event.rubric.halves.booth.label },
    groups: report.groups.map((g) => ({ id: g.id, code: g.code, name: g.name, acceptReason: g.accept_reason ?? null, complete: report.resultById.get(g.id)?.complete ?? false })),
    sheets: report.sheets.map((s) => ({ groupId: s.group_id, half: s.half, status: s.status, judgeName: s.judge_name, filled: report.filled.get(s.id) ?? 0 })),
    members: report.grades.map((g) => ({ studentId: g.student.id, name: fullName(g.student), groupId: g.group.id, absent: g.absent, memberComplete: g.memberComplete })),
    unplaced: students.filter((s) => !s.group_id).map((s) => ({ studentId: s.id, name: fullName(s), section: s.section, excludedReason: s.excluded_reason ?? null })),
  });
}

/** One stored score as the coordinator sees it: the value, and any correction made to it (decision 7). */
export interface StoredScore {
  value: number;
  correctedByName: string | null;
  correctedAt: Date | null;
  reason: string | null;
  /** The judge's own value before the coordinator's first correction; null if the judge left it blank. */
  judgeValue: number | null;
}

/** Every judge's sheet for one group and half, keyed like the phone (sheet.ts: c:…, m:…), with corrections. */
export async function groupScoreDetail(event: EventRow, groupId: string, half: Half) {
  const sheets = await query<SheetRow>(
    `SELECT s.id, s.group_id, s.half, s.judge_id, s.status, a.display_name AS judge_name FROM score_sheet s JOIN account a ON a.id = s.judge_id
     WHERE s.event_id = $1 AND s.group_id = $2 AND s.half = $3 ORDER BY a.display_name`,
    [event.id, groupId, half],
  );
  const ids = sheets.map((s) => s.id);
  type Raw = { sheet_id: string; key: string; value: number; corrected_by_name: string | null; corrected_at: Date | null; correction_reason: string | null; judge_value: number | null };
  const [values, members, history, removedLog] = await Promise.all([
    query<Raw>(
      `SELECT v.sheet_id, 'c:' || v.criterion_key AS key, v.value, a.display_name AS corrected_by_name, v.corrected_at, v.correction_reason, v.judge_value
       FROM score_value v LEFT JOIN account a ON a.id = v.corrected_by WHERE v.sheet_id = ANY($1::text[])`,
      [ids],
    ),
    query<Raw>(
      `SELECT v.sheet_id, 'm:' || v.student_id || ':' || v.field AS key, v.value, a.display_name AS corrected_by_name, v.corrected_at, v.correction_reason, v.judge_value
       FROM member_score v LEFT JOIN account a ON a.id = v.corrected_by WHERE v.sheet_id = ANY($1::text[])`,
      [ids],
    ),
    query<{ created_at: Date; who: string | null; detail: { judge?: string; label?: string; from?: number | null; to?: number | null; reason?: string } }>(
      `SELECT c.created_at, a.display_name AS who, c.detail FROM change_log c LEFT JOIN account a ON a.id = c.account_id
       WHERE c.event_id = $1 AND c.action = 'score.correct' AND c.detail->>'group' = $2 AND c.detail->>'half' = $3 ORDER BY c.created_at DESC`,
      [event.id, groupId, half],
    ),
    removedScores(event.id, ids),
  ]);
  const scores = new Map<string, Map<string, StoredScore>>(ids.map((id) => [id, new Map()]));
  for (const r of [...values, ...members]) {
    scores.get(r.sheet_id)?.set(r.key, {
      value: Number(r.value),
      correctedByName: r.corrected_by_name,
      correctedAt: r.corrected_at,
      reason: r.correction_reason,
      judgeValue: r.judge_value === null ? null : Number(r.judge_value),
    });
  }
  /** Scores the coordinator removed (corrected to blank), for boxes that are still blank. */
  const removed = new Map<string, Map<string, RemovedScore>>(
    ids.map((id) => [id, new Map([...(removedLog.get(id) ?? [])].filter(([key]) => !scores.get(id)?.has(key)))]),
  );
  return { sheets, scores, history, removed };
}

export const criteriaCount = (rubric: Rubric, half: Half) => criteriaOf(rubric, half).length;
export { HALVES };

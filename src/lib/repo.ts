// Reads shared by pages, actions and the export. All SQL outside db.ts, auth.ts and seed.ts lives here or in actions.

import { one, query } from './db';
import { criteriaOf, DEFAULT_RUBRIC, HALVES, type Half, type MemberFieldKey, type Rubric } from './rubric';
import { computeResults, finalGrade, letterGrade, memberScore, type EventResults, type MemberSet, type ScoredGroup, type SheetValues } from './scoring';

export interface EventRow {
  id: string;
  year: number;
  title: string;
  status: 'setup' | 'judging' | 'finalised';
  rubric: Rubric;
  created_at: Date;
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
    `SELECT s.* FROM group_member m JOIN student s ON s.id = m.student_id WHERE m.group_id = $1 ORDER BY s.surname, s.first_name`,
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
  return query<{ id: string; name: string; email: string; group_count: number }>(
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

export const fullName = (s: Pick<StudentRow, 'first_name' | 'surname'>) => `${s.first_name} ${s.surname}`;
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

/** Every sheet, value and member score of an event, shaped for the scoring functions. */
export async function loadEventScores(event: EventRow) {
  const [sheets, values, members] = await Promise.all([
    query<SheetRow>(
      `SELECT s.id, s.group_id, s.half, s.judge_id, s.status, a.display_name AS judge_name FROM score_sheet s JOIN account a ON a.id = s.judge_id WHERE s.event_id = $1 ORDER BY a.display_name`,
      [event.id],
    ),
    query<{ sheet_id: string; criterion_key: string; value: number }>(
      `SELECT v.sheet_id, v.criterion_key, v.value FROM score_value v JOIN score_sheet s ON s.id = v.sheet_id WHERE s.event_id = $1`,
      [event.id],
    ),
    query<{ sheet_id: string; student_id: string; field: MemberFieldKey; value: number }>(
      `SELECT v.sheet_id, v.student_id, v.field, v.value FROM member_score v JOIN score_sheet s ON s.id = v.sheet_id WHERE s.event_id = $1`,
      [event.id],
    ),
  ]);

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
  return { sheets, sheetValues, filled, memberSets };
}

export interface GradeRow {
  student: StudentRow;
  group: GroupRow;
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
}

/** Results, leaderboards and individual grades for a whole event, computed live from the stored scores. */
export async function eventReport(event: EventRow): Promise<EventReport> {
  const [groups, scores, memberRows] = await Promise.all([
    listGroups(event.id),
    loadEventScores(event),
    query<StudentRow & { group_id: string }>(
      `SELECT s.*, m.group_id FROM group_member m JOIN student s ON s.id = m.student_id WHERE m.event_id = $1 ORDER BY s.surname, s.first_name`,
      [event.id],
    ),
  ]);
  const scored: ScoredGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
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
    // No grade from incomplete scores: a missing member field or an unjudged part of the group is never a zero.
    const final = finalGrade(member.complete ? member.total : null, groupReady ? overall : null);
    const lg = letterGrade(final, event.rubric.grades);
    return {
      student: st,
      group,
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

  return { event, groups, results, resultById, grades, sheets: scores.sheets, sheetValues: scores.sheetValues, filled: scores.filled };
}

export const criteriaCount = (rubric: Rubric, half: Half) => criteriaOf(rubric, half).length;
export { HALVES };

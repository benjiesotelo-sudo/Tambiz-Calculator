// The coordinator's flows against a real Postgres: PGlite in memory, with the sample practice event.
// Never Neon: DATABASE_URL is removed before the database is first opened.
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const { Redirected } = vi.hoisted(() => {
  process.env.PGLITE_DIR = 'memory://';
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_POOLED;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  class Redirected extends Error {
    constructor(public url: string) {
      super(`redirect to ${url}`);
    }
  }
  return { Redirected };
});

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ refresh: () => {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
  notFound: () => {
    throw new Error('not found');
  },
}));
vi.mock('@/lib/auth', () => {
  const admin = { id: 'test-coordinator', email: 'coordinator@tambiz.test', display_name: 'Test Coordinator', role: 'admin' };
  return { currentAccount: async () => admin, requireAccount: async () => admin, requireAdmin: async () => admin, requireJudge: async () => admin };
});

import { acceptGroup, closeEvent, setMemberAbsent, undoClose } from '@/app/admin/actions';
import { removeJudgesTable, removeStudentsTable, resetJudgeTable, saveDataTable, saveJudgesTable, saveScoresTable } from '@/app/admin/table-actions';
import { POST as emails } from '@/app/api/admin/events/[id]/emails/route';
import { one, query } from '@/lib/db';
import { EMAIL_TABLE, emailRecipients } from '@/lib/email-file';
import { buildWorkbook } from '@/lib/excel-export';
import { LOCKED_CLOSED, LOCKED_SENT } from '@/lib/locks';
import { verifyPassword } from '@/lib/passwords';
import { judgeEventProfile } from '@/lib/profiles-data';
import { eventFinaliseChecks, eventReport, getEvent, groupScoreDetail, listAdvisers, type EventRow } from '@/lib/repo';
import { criteriaOf, type Half } from '@/lib/rubric';
import { computeResults } from '@/lib/scoring';
import { PRACTICE_TITLE } from '@/lib/seed';

type Action = (fd: FormData) => Promise<unknown>;

/** Runs a server action and reads the message it redirects back with. */
async function act(fn: Action, fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    await fn(fd);
  } catch (e) {
    if (!(e instanceof Redirected)) throw e;
    const u = new URL(e.url, 'http://localhost');
    return { ok: u.searchParams.get('ok'), error: u.searchParams.get('error') };
  }
  throw new Error('The action did not redirect.');
}

let event: EventRow;
async function setEvent(status: EventRow['status'], sent: boolean) {
  await query('UPDATE event SET status = $2, released_at = $3 WHERE id = $1', [event.id, status, sent ? new Date() : null]);
  event = (await getEvent(event.id))!;
}

/** Every stored score, correction and sheet status, to prove something left them alone. */
const allScores = async () => ({
  sheets: await query('SELECT id, group_id, half, judge_id, status FROM score_sheet ORDER BY id'),
  values: await query('SELECT * FROM score_value ORDER BY sheet_id, criterion_key'),
  members: await query('SELECT * FROM member_score ORDER BY sheet_id, student_id, field'),
});

beforeAll(async () => {
  const row = await one<{ id: string }>('SELECT id FROM event WHERE title = $1', [PRACTICE_TITLE]);
  event = (await getEvent(row!.id))!;
});

describe('the sample data is a practice event that looks like the real one', () => {
  it('is marked practice, with Sec - n sections, SURNAME, FIRST NAME advisers and the real group names', async () => {
    expect(event.practice).toBe(true);
    const sections = await query<{ section: string }>('SELECT DISTINCT section FROM student WHERE event_id = $1', [event.id]);
    expect(sections.every((s) => s.section === '' || /^Sec - (1[0-2]|[1-9])$/.test(s.section))).toBe(true);
    expect(sections.some((s) => s.section === '')).toBe(true);
    const advisers = await listAdvisers(event.id);
    expect(advisers.every((a) => /^[A-Z ]+, [A-Z ]+$/.test(a.name))).toBe(true);
    const groups = (await query<{ name: string }>('SELECT name FROM tgroup WHERE event_id = $1', [event.id])).map((g) => g.name);
    expect(groups).toEqual(expect.arrayContaining(['PAYONG PALAY', 'PINILI', 'BUGA', 'AMIHAN CHARCOAL', 'WEAVE WALKS']));
  });
});

describe('only a submitted sheet counts (14 September 2026)', () => {
  it('sheets in progress feed no result, grade, export or finalise check, but are listed apart for Progress', async () => {
    const open = await query<{ id: string; group_id: string; half: Half }>(`SELECT id, group_id, half FROM score_sheet WHERE event_id = $1 AND status = 'in_progress'`, [event.id]);
    expect(open.length).toBeGreaterThan(0);
    const report = await eventReport(event);
    expect(report.sheets.every((s) => s.status === 'complete')).toBe(true);
    expect(new Set(report.openSheets.map((s) => s.id))).toEqual(new Set(open.map((s) => s.id)));
    expect(open.every((s) => !report.sheetValues.has(s.id))).toBe(true);

    // Every group's results are exactly what its submitted sheets alone give.
    const scored = report.groups.map((g) => ({
      id: g.id,
      name: g.name,
      accepted: !!g.accept_reason,
      defense: report.sheets.filter((s) => s.group_id === g.id && s.half === 'defense').map((s) => report.sheetValues.get(s.id)!),
      booth: report.sheets.filter((s) => s.group_id === g.id && s.half === 'booth').map((s) => report.sheetValues.get(s.id)!),
    }));
    expect(report.results).toEqual(computeResults(event.rubric, scored));

    // A half whose only sheet is in progress has no percentage, and its members' in-progress scores give no total.
    const onlyOpen = open.find((o) => !report.sheets.some((s) => s.group_id === o.group_id && s.half === o.half));
    expect(onlyOpen).toBeDefined();
    const result = report.resultById.get(onlyOpen!.group_id)!;
    expect(onlyOpen!.half === 'defense' ? result.defense : result.booth).toBeNull();
    if (onlyOpen!.half === 'defense') expect(report.grades.filter((g) => g.group.id === onlyOpen!.group_id).every((g) => g.total === null)).toBe(true);

    // The workbook lists only submitted sheets.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(report)) as unknown as ArrayBuffer);
    const statuses: string[] = [];
    for (const name of ['Scores', 'Booth Scores']) wb.getWorksheet(name)!.eachRow((row, n) => n > 1 && statuses.push(String(row.getCell(3).value)));
    expect(new Set(statuses)).toEqual(new Set(['Complete']));

    // Finalising names the sheet in progress and says it does not count.
    const { warnings } = await eventFinaliseChecks(report);
    expect(warnings.some((w) => /None of its scores count until they do/.test(w.text))).toBe(true);
  });
});

describe('the Data table: every student with their group and adviser', () => {
  const studentIn = async (group: string) =>
    (await one<{ id: string; student_number: string; surname: string; group_id: string }>(
      'SELECT s.id, s.student_number, s.surname, m.group_id FROM student s JOIN group_member m ON m.student_id = s.id JOIN tgroup g ON g.id = m.group_id WHERE g.event_id = $1 AND g.name = $2 ORDER BY s.student_number LIMIT 1',
      [event.id, group],
    ))!;
  const groupNamed = async (name: string) => (await one<{ id: string; adviser_id: string }>('SELECT id, adviser_id FROM tgroup WHERE event_id = $1 AND name = $2', [event.id, name]))!;

  it('moves a student to a group typed by name, ignoring capitals and punctuation, and leaves every score alone', async () => {
    await setEvent('judging', false);
    const st = await studentIn('PINILI');
    const buga = await groupNamed('BUGA');
    const before = await allScores();
    const moved = await saveDataTable(event.id, [{ rowId: st.id, key: 'group', value: ' buga! ' }]);
    expect(moved.rows).toHaveLength(1);
    expect(moved.rows[0].row!.cells).toMatchObject({ group: 'BUGA' });
    expect(moved.notice).toMatch(/Moved 1 student to another group/);
    expect(await one('SELECT group_id FROM group_member WHERE student_id = $1', [st.id])).toEqual({ group_id: buga.id });
    expect(await allScores()).toEqual(before);
    await saveDataTable(event.id, [{ rowId: st.id, key: 'group', value: 'PINILI' }]);
  });

  it('a new group typed on a row keeps the student’s adviser; a new student naming a different adviser for a group is refused on that cell', async () => {
    await setEvent('judging', false);
    const st = await studentIn('BUGA');
    const made = await saveDataTable(event.id, [{ rowId: st.id, key: 'group', value: 'Bagong Grupo' }]);
    expect(made.refresh).toBe(true);
    const g = (await one<{ id: string; adviser_id: string; code: string | null }>(`SELECT id, adviser_id, code FROM tgroup WHERE event_id = $1 AND name = 'Bagong Grupo'`, [event.id]))!;
    expect(g.adviser_id).toBe((await groupNamed('BUGA')).adviser_id);
    expect(g.code).toBeNull();

    // Moving the only member back leaves the new group empty and unscored, so it is tidied away.
    await saveDataTable(event.id, [{ rowId: st.id, key: 'group', value: 'BUGA' }]);
    expect(await one(`SELECT count(*)::int AS n FROM tgroup WHERE event_id = $1 AND name = 'Bagong Grupo'`, [event.id])).toEqual({ n: 0 });

    const other = (await one<{ name: string }>('SELECT name FROM adviser WHERE event_id = $1 AND id <> $2 ORDER BY name LIMIT 1', [event.id, (await groupNamed('PINILI')).adviser_id]))!;
    const refused = await saveDataTable(event.id, [
      { rowId: 'new:1', key: 'student', value: '2099000001' },
      { rowId: 'new:1', key: 'surname', value: 'Reyes' },
      { rowId: 'new:1', key: 'first', value: 'Ana' },
      { rowId: 'new:1', key: 'email', value: 'ana.reyes@tambiz.test' },
      { rowId: 'new:1', key: 'group', value: 'PINILI' },
      { rowId: 'new:1', key: 'adviser', value: other.name },
    ]);
    expect(refused.rows[0].errors?.adviser).toMatch(/^PINILI’s adviser is .+\. To change it for the whole group, change Adviser on any of its rows\.$/);
    expect(await one(`SELECT count(*)::int AS n FROM student WHERE student_number = '2099000001'`)).toEqual({ n: 0 });

    // With Adviser left blank, a new student joining an existing group takes its adviser; a new group still needs one.
    const joined = await saveDataTable(event.id, [
      { rowId: 'new:4', key: 'student', value: '2099000004' },
      { rowId: 'new:4', key: 'surname', value: 'Reyes' },
      { rowId: 'new:4', key: 'first', value: 'Ana' },
      { rowId: 'new:4', key: 'email', value: 'ana.reyes@tambiz.test' },
      { rowId: 'new:4', key: 'group', value: 'PINILI' },
    ]);
    const pinili = await groupNamed('PINILI');
    expect(joined.rows[0].errors).toBeUndefined();
    expect(joined.rows[0].row!.cells).toMatchObject({ group: 'PINILI', adviser: (await one<{ name: string }>('SELECT name FROM adviser WHERE id = $1', [pinili.adviser_id]))!.name });
    expect((await removeStudentsTable(event.id, [joined.rows[0].row!.id])).rows[0].removed).toBe(true);
    const lonely = await saveDataTable(event.id, [
      { rowId: 'new:5', key: 'student', value: '2099000005' },
      { rowId: 'new:5', key: 'surname', value: 'Reyes' },
      { rowId: 'new:5', key: 'first', value: 'Ana' },
      { rowId: 'new:5', key: 'email', value: 'ana.reyes@tambiz.test' },
      { rowId: 'new:5', key: 'group', value: 'Walang Adviser' },
    ]);
    expect(lonely.rows[0].errors?.adviser).toBe('Every group needs an adviser.');
    expect(await one(`SELECT count(*)::int AS n FROM tgroup WHERE event_id = $1 AND name = 'Walang Adviser'`, [event.id])).toEqual({ n: 0 });
  });

  it('adds a student with no section; a student number already in the app is refused', async () => {
    await setEvent('judging', false);
    const pinili = await groupNamed('PINILI');
    const adviser = (await one<{ name: string }>('SELECT name FROM adviser WHERE id = $1', [pinili.adviser_id]))!;
    const row = (n: string, student: string) => [
      { rowId: n, key: 'student', value: student },
      { rowId: n, key: 'surname', value: 'Reyes' },
      { rowId: n, key: 'first', value: 'Ana' },
      { rowId: n, key: 'email', value: 'ana.reyes@tambiz.test' },
      { rowId: n, key: 'group', value: pinili.id },
      { rowId: n, key: 'adviser', value: adviser.name },
    ];
    const added = await saveDataTable(event.id, row('new:2', '2099000002'));
    expect(added.rows[0].error).toBeUndefined();
    expect(added.rows[0].errors).toBeUndefined();
    expect(added.rows[0].row!.cells).toMatchObject({ student: '2099000002', section: '', group: 'PINILI', adviser: adviser.name });
    expect(added.rows[0].row!.notes?.section).toMatch(/For Encoding grade sheet cannot be organised by section/);
    const twin = await saveDataTable(event.id, row('new:3', '2099000002'));
    expect(twin.rows[0].errors?.student).toMatch(/already in the app/);
    const id = added.rows[0].row!.id;
    expect((await removeStudentsTable(event.id, [id])).rows).toEqual([{ rowId: id, removed: true }]);
  });

  it('an adviser or adviser email changed on one row changes it for the whole group, and every member’s row comes back', async () => {
    await setEvent('judging', false);
    const st = await studentIn('WEAVE WALKS');
    const g = await groupNamed('WEAVE WALKS');
    const members = await query<{ student_id: string }>('SELECT student_id FROM group_member WHERE group_id = $1', [g.id]);
    expect(members.length).toBeGreaterThan(1);
    const before = (await one<{ email: string }>('SELECT email FROM adviser WHERE id = $1', [g.adviser_id]))!;

    const email = await saveDataTable(event.id, [{ rowId: st.id, key: 'adviserEmail', value: 'weave.adviser@tambiz.test' }]);
    expect(members.every((m) => email.rows.some((r) => r.rowId === m.student_id && r.row?.cells.adviserEmail === 'weave.adviser@tambiz.test'))).toBe(true);
    expect((await saveDataTable(event.id, [{ rowId: st.id, key: 'adviserEmail', value: 'not an email' }])).rows[0].errors?.adviserEmail).toMatch(/not an email address/);

    const changed = await saveDataTable(event.id, [{ rowId: st.id, key: 'adviser', value: 'CRUZ, BENJAMIN' }]);
    expect(changed.refresh).toBe(true);
    expect(members.every((m) => changed.rows.some((r) => r.rowId === m.student_id && r.row?.cells.adviser === 'CRUZ, BENJAMIN'))).toBe(true);
    expect(await one('SELECT a.name FROM tgroup g JOIN adviser a ON a.id = g.adviser_id WHERE g.id = $1', [g.id])).toEqual({ name: 'CRUZ, BENJAMIN' });

    await saveDataTable(event.id, [{ rowId: st.id, key: 'adviser', value: g.adviser_id }]);
    await query('UPDATE adviser SET email = $2 WHERE id = $1', [g.adviser_id, before.email]);
  });

  it('once closed, groups and advisers are locked but details can be corrected; once the email file is out, nothing changes', async () => {
    await setEvent('finalised', false);
    const st = await studentIn('BUGA');
    const closed = await saveDataTable(event.id, [
      { rowId: st.id, key: 'group', value: 'PINILI' },
      { rowId: st.id, key: 'surname', value: `${st.surname} Jr.` },
    ]);
    expect(closed.rows[0].errors).toEqual({ group: LOCKED_CLOSED });
    expect(closed.rows[0].row!.cells).toMatchObject({ group: 'BUGA', surname: `${st.surname} Jr.` });
    expect((await saveDataTable(event.id, [{ rowId: 'new:x', key: 'student', value: '2099000009' }])).rows[0].error).toBe(LOCKED_CLOSED);
    expect((await removeStudentsTable(event.id, [st.id])).rows[0].error).toBe(LOCKED_CLOSED);

    await setEvent('finalised', true);
    expect((await saveDataTable(event.id, [{ rowId: st.id, key: 'surname', value: st.surname }])).rows[0].error).toBe(LOCKED_SENT);
    await setEvent('judging', false);
    await saveDataTable(event.id, [{ rowId: st.id, key: 'surname', value: st.surname }]);
  });

  it('a student the judges have scored cannot be removed, since that would delete their scores', async () => {
    await setEvent('judging', false);
    const scored = (await one<{ student_id: string }>('SELECT student_id FROM member_score LIMIT 1'))!;
    const before = await allScores();
    expect((await removeStudentsTable(event.id, [scored.student_id])).rows[0].error).toMatch(/has individual scores from the judges, so cannot be removed/);
    expect(await allScores()).toEqual(before);
  });
});

describe('the Judges table', () => {
  it('a new judge’s password is shown once, to print, and only a fingerprint is stored; Reset password shows a new one', async () => {
    await setEvent('judging', false);
    const created = await saveJudgesTable(event.id, [
      { rowId: 'new:j', key: 'name', value: 'Dr. Table Judge' },
      { rowId: 'new:j', key: 'login', value: 'Table.Judge@tambiz.test' },
    ]);
    expect(created.signIns).toEqual([{ name: 'Dr. Table Judge', login: 'table.judge@tambiz.test', password: expect.any(String) }]);
    const id = created.rows[0].row!.id;
    const password = created.signIns![0].password;
    const stored = (await one<{ password_hash: string }>('SELECT password_hash FROM account WHERE id = $1', [id]))!.password_hash;
    expect(stored).not.toContain(password);
    expect(await verifyPassword(password, stored)).toBe(true);

    const reset = await resetJudgeTable(event.id, id);
    expect(reset.signIns).toEqual([{ name: 'Dr. Table Judge', login: 'table.judge@tambiz.test', password: expect.any(String) }]);
    const after = (await one<{ password_hash: string }>('SELECT password_hash FROM account WHERE id = $1', [id]))!.password_hash;
    expect(await verifyPassword(password, after)).toBe(false);
    expect(await verifyPassword(reset.signIns![0].password, after)).toBe(true);

    // A known login is added to the event with its password unchanged, and no password is shown.
    await removeJudgesTable(event.id, [id]);
    const again = await saveJudgesTable(event.id, [
      { rowId: 'new:k', key: 'name', value: 'Someone Else' },
      { rowId: 'new:k', key: 'login', value: 'table.judge@tambiz.test' },
    ]);
    expect(again.signIns).toEqual([]);
    expect(again.notice).toMatch(/already had an account, as Dr\. Table Judge/);
    expect(await one('SELECT password_hash FROM account WHERE id = $1', [id])).toEqual({ password_hash: after });
    await removeJudgesTable(event.id, [id]);
  });
});

describe('absence (the department’s rule, 17 September 2026)', () => {
  it('an absent member’s blank individual scores count as zero, the grade is worked out, and a correction for them counts', async () => {
    await setEvent('judging', false);
    const ready = (await eventReport(event)).grades.find((g) => g.groupReady && g.memberComplete && !g.absent)!;
    const saved = await query<{ sheet_id: string; field: string; value: number }>('SELECT sheet_id, field, value FROM member_score WHERE student_id = $1', [ready.student.id]);
    await query('DELETE FROM member_score WHERE student_id = $1', [ready.student.id]);
    const blank = (await eventReport(event)).grades.find((g) => g.student.id === ready.student.id)!;
    expect([blank.total, blank.letter]).toEqual([null, null]);

    expect((await act(setMemberAbsent, { eventId: event.id, groupId: ready.group.id, studentId: ready.student.id, absent: 'yes' })).ok).toMatch(/count as zero/);
    const absent = (await eventReport(event)).grades.find((g) => g.student.id === ready.student.id)!;
    expect([absent.total, absent.memberComplete, absent.final]).toEqual([0, true, (0 + Math.round(absent.overall! * 100) / 100) / 2]);
    expect(absent.letter).not.toBeNull();

    // The coordinator gives them a score on their group's scores page, with a reason; it counts.
    const sheet = saved[0]?.sheet_id ?? (await one<{ id: string }>(`SELECT id FROM score_sheet WHERE group_id = $1 AND half = 'defense' AND status = 'complete' LIMIT 1`, [ready.group.id]))!.id;
    const res = await saveScoresTable(event.id, ready.group.id, 'defense', [{ rowId: `m:${ready.student.id}:qa`, key: sheet, value: '30' }], 'Presented the Q&A the next day');
    expect(res.notice).toMatch(/Corrected/);
    expect((await eventReport(event)).grades.find((g) => g.student.id === ready.student.id)!.total).toBe(30);

    await act(setMemberAbsent, { eventId: event.id, groupId: ready.group.id, studentId: ready.student.id, absent: 'no' });
    await query('DELETE FROM member_score WHERE student_id = $1', [ready.student.id]);
    for (const r of saved) await query('INSERT INTO member_score (sheet_id, student_id, field, value) VALUES ($1, $2, $3, $4)', [r.sheet_id, ready.student.id, r.field, r.value]);
  });
});

describe('closing the event and the two files', () => {
  const download = (confirm = true, origin?: string) => {
    const fd = new FormData();
    if (confirm) fd.set('confirm', 'yes');
    return emails(new Request(`http://localhost/api/admin/events/${event.id}/emails`, { method: 'POST', body: fd, headers: origin ? { origin, host: 'localhost' } : {} }), {
      params: Promise.resolve({ id: event.id }),
    });
  };
  const blockers = async () => eventFinaliseChecks(await eventReport(event)).blockers;
  /** Settles every item the Close screen lists as Needs you, the way the coordinator would. */
  async function settle() {
    const report = await eventReport(event);
    for (const b of await blockers()) {
      const done =
        b.kind === 'group'
          ? await act(acceptGroup, { eventId: event.id, groupId: b.id, reason: 'Settled for the test' })
          : await act(setMemberAbsent, { eventId: event.id, groupId: report.grades.find((g) => g.student.id === b.id)!.group.id, studentId: b.id, absent: 'yes' });
      expect(done.error).toBeNull();
    }
    expect(await blockers()).toEqual([]);
  }

  it('closing is refused while something needs the coordinator, and allowed once settled; undo reopens judging', async () => {
    await setEvent('judging', false);
    expect((await blockers()).length).toBeGreaterThan(0);
    expect((await act(closeEvent, { eventId: event.id, confirm: 'yes' })).error).toMatch(/The event cannot close yet: \d+ items? needs? you first/);
    await settle();
    expect((await act(closeEvent, { eventId: event.id })).error).toMatch(/Tick the box/);
    expect((await act(closeEvent, { eventId: event.id, confirm: 'yes' })).ok).toMatch(/The event is closed/);
    expect((await getEvent(event.id))!.status).toBe('finalised');
    expect((await act(undoClose, { eventId: event.id, confirm: 'yes' })).ok).toMatch(/Closing is undone/);
    expect((await getEvent(event.id))!.status).toBe('judging');
  });

  it('the email file needs a closed event and a tick; its first download locks the event, and undo is then refused', async () => {
    await setEvent('judging', false);
    await settle();
    const early = await download();
    expect(early.status).toBe(303);
    expect(new URL(early.headers.get('location')!).searchParams.get('error')).toMatch(/Close the event first/);

    await act(closeEvent, { eventId: event.id, confirm: 'yes' });
    expect(new URL((await download(false)).headers.get('location')!).searchParams.get('error')).toMatch(/Tick the box/);
    for (const origin of ['null', 'not a url', 'https://elsewhere.example']) expect((await download(true, origin)).status).toBe(403);
    expect((await getEvent(event.id))!.released_at).toBeNull();

    const before = await allScores();
    const file = await download();
    expect(file.status).toBe(200);
    event = (await getEvent(event.id))!;
    expect(event.released_at).not.toBeNull();
    expect((await act(undoClose, { eventId: event.id, confirm: 'yes' })).error).toMatch(/Closing cannot be undone/);
    const v = (await one<{ sheet_id: string; criterion_key: string; group_id: string }>(
      `SELECT v.sheet_id, v.criterion_key, s.group_id FROM score_value v JOIN score_sheet s ON s.id = v.sheet_id WHERE s.event_id = $1 AND s.half = 'defense' LIMIT 1`,
      [event.id],
    ))!;
    const refused = await saveScoresTable(event.id, v.group_id, 'defense', [{ rowId: `c:${v.criterion_key}`, key: v.sheet_id, value: '1' }], 'Too late');
    expect(Object.values(refused.rows[0].errors ?? {})).toEqual([LOCKED_SENT]);
    expect(await allScores()).toEqual(before);
    // A second download is the same file again, and needs no tick.
    expect((await download(false)).status).toBe(200);

    // The file: an Excel table of Email, Name and Message, students first, then advisers.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.getWorksheet(EMAIL_TABLE)!;
    expect([1, 2, 3].map((c) => ws.getRow(1).getCell(c).text)).toEqual(['Email', 'Name', 'Message']);
    const { students, advisers, nobody } = emailRecipients(await eventReport(event), await listAdvisers(event.id));
    expect(ws.rowCount - 1).toBe(students.length + advisers.length);
    expect(ws.getRow(2).getCell(1).text).toBe(students[0].email);
    expect(ws.getRow(ws.rowCount).getCell(1).text).toBe(advisers.at(-1)!.email);
    expect(nobody.some((t) => /^OCAMPO, DANILO, adviser of .+, has no email, so gets no email\./.test(t))).toBe(true);
    await setEvent('judging', false);
  });
});

describe('what the emails say', () => {
  it('a student hears their letter grade and group percentage, and never a rank or place', async () => {
    const report = await eventReport(event);
    const { students } = emailRecipients(report, await listAdvisers(event.id));
    expect(students.length).toBeGreaterThan(0);
    for (const row of students) {
      const g = report.grades.find((x) => x.student.email === row.email)!;
      expect(row.message).toContain(`Your letter grade: <b>${g.letter}</b>`);
      expect(row.message).toMatch(/: <b>\d+\.\d\d%<\/b>/);
      expect(row.message).not.toMatch(/rank|place|top 10|award|\b\d+(st|nd|rd|th)\b/i);
    }
  });

  it('an adviser gets one row however many groups they hold, each with its percentage, and the award caution', async () => {
    const report = await eventReport(event);
    const advisers = await listAdvisers(event.id);
    const { advisers: rows } = emailRecipients(report, advisers);
    const many = advisers.find((a) => a.group_count > 1 && a.email)!;
    const mine = rows.filter((r) => r.email === many.email);
    expect(mine).toHaveLength(1);
    for (const g of report.groups.filter((x) => x.adviser_id === many.id)) expect(mine[0].message).toContain(`<li>${g.name}: `);
    expect(rows.some((r) => r.message.includes('<b>Top 10</b> in'))).toBe(true);
    for (const r of rows) {
      expect(r.message).toContain('a place in the top 10 is not the same as winning an award. Awards are announced at the ceremony.');
      expect(r.message).not.toMatch(/\b\d+(st|nd|rd|th)\b|rank/i);
    }
  });
});

describe('a score corrected to blank keeps its trace (decision 7)', () => {
  it('shows as corrected on the scores page and in the workbook, and the judge’s value survives a later correction', async () => {
    await setEvent('judging', false);
    const v = (await one<{ sheet_id: string; criterion_key: string; value: number; group_id: string }>(
      `SELECT v.sheet_id, v.criterion_key, v.value, s.group_id FROM score_value v JOIN score_sheet s ON s.id = v.sheet_id
       WHERE s.event_id = $1 AND s.half = 'defense' AND s.status = 'complete' AND v.corrected_by IS NULL ORDER BY v.sheet_id, v.criterion_key LIMIT 1`,
      [event.id],
    ))!;
    const key = `c:${v.criterion_key}`;
    const judgeGave = Number(v.value);
    const correct = async (value: string, reason: string) => (await saveScoresTable(event.id, v.group_id, 'defense', [{ rowId: key, key: v.sheet_id, value }], reason)).notice;

    expect(await correct('', 'Judge scored the wrong group')).toMatch(/→ blank\. The judge’s own score is kept/);

    const detail = await groupScoreDetail(event, v.group_id, 'defense');
    expect(detail.scores.get(v.sheet_id)?.has(key)).toBe(false);
    expect(detail.removed.get(v.sheet_id)?.get(key)).toMatchObject({ judgeValue: judgeGave, previous: judgeGave, reason: 'Judge scored the wrong group' });

    const report = await eventReport(event);
    expect(report.corrections.get(v.sheet_id)).toContainEqual({ key, value: null, judgeValue: judgeGave, reason: 'Judge scored the wrong group' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(report)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Scores')!;
    let col = 0;
    ws.getRow(1).eachCell((c, i) => {
      if (c.value === 'Corrected by the coordinator') col = i;
    });
    const notes: string[] = [];
    ws.eachRow((row, n) => {
      if (n > 1) notes.push(String(row.getCell(col).value ?? ''));
    });
    expect(notes.some((t) => t.includes(`judge gave ${judgeGave}, now blank (Judge scored the wrong group)`))).toBe(true);

    expect(await correct('0', 'Judge confirmed a zero')).toMatch(/blank → 0\. The judge’s own score is kept/);
    expect((await eventReport(event)).corrections.get(v.sheet_id)).toContainEqual({ key, value: 0, judgeValue: judgeGave, reason: 'Judge confirmed a zero' });
    expect((await groupScoreDetail(event, v.group_id, 'defense')).removed.get(v.sheet_id)?.has(key) ?? false).toBe(false);
  });
});

describe('the scores table corrects only its own group and half (14 September 2026)', () => {
  it('a score from another group or half is refused before anything is written or recorded', async () => {
    await setEvent('judging', false);
    const v = (await one<{ sheet_id: string; criterion_key: string; value: number; group_id: string }>(
      `SELECT v.sheet_id, v.criterion_key, v.value, s.group_id FROM score_value v JOIN score_sheet s ON s.id = v.sheet_id
       WHERE s.event_id = $1 AND s.half = 'defense' AND s.status = 'complete' AND v.corrected_by IS NULL ORDER BY v.sheet_id DESC, v.criterion_key LIMIT 1`,
      [event.id],
    ))!;
    const other = (await one<{ id: string }>('SELECT id FROM tgroup WHERE event_id = $1 AND id <> $2 ORDER BY name LIMIT 1', [event.id, v.group_id]))!;
    const key = `c:${v.criterion_key}`;
    const state = async () => ({
      value: Number((await one<{ value: number }>('SELECT value FROM score_value WHERE sheet_id = $1 AND criterion_key = $2', [v.sheet_id, v.criterion_key]))!.value),
      logged: Number((await one<{ n: string }>(`SELECT count(*) AS n FROM change_log WHERE action = 'score.correct' AND detail->>'sheet' = $1`, [v.sheet_id]))!.n),
    });
    const before = await state();
    const to = Number(v.value) === 0 ? '1' : '0';

    const elsewhere = await saveScoresTable(event.id, other.id, 'defense', [{ rowId: key, key: v.sheet_id, value: to }], 'Hand-built request');
    expect(elsewhere.rows[0].errors).toEqual({ [v.sheet_id]: 'That score belongs to another group.' });
    expect(elsewhere.notice).toBeUndefined();
    const otherHalf = await saveScoresTable(event.id, v.group_id, 'booth', [{ rowId: key, key: v.sheet_id, value: to }], 'Hand-built request');
    expect(otherHalf.notice).toBeUndefined();
    expect(await state()).toEqual(before);
  });
});

describe('judge profiles (item 14)', () => {
  it('a judge assigned but not yet scoring has a profile with nothing to compare, plus their record from other events', async () => {
    const judgeId = 'test-judge-new';
    await query(`INSERT INTO account (id, email, display_name, role, password_hash) VALUES ($1, 'new.judge@tambiz.test', 'New Judge', 'judge', 'x')`, [judgeId]);
    expect(await judgeEventProfile(event, judgeId)).toBeNull();

    await query('INSERT INTO event_judge (event_id, account_id) VALUES ($1, $2)', [event.id, judgeId]);
    const found = (await judgeEventProfile(event, judgeId))!;
    expect(found.scoredHere).toBe(false);
    expect(found.profile).toMatchObject({ judgeName: 'New Judge', groups: 0, marksAt: null });
    expect(found.profile.summary).toMatch(/nothing to compare yet/);
    expect(found.history).toEqual([]);

    const past = 'test-event-2026';
    await query(`INSERT INTO event (id, year, title, status, rubric) VALUES ($1, 2026, 'Tambiz 2026', 'finalised', $2::jsonb)`, [past, JSON.stringify(event.rubric)]);
    await query(`INSERT INTO tgroup (id, event_id, name, name_key) VALUES ('test-group-2026', $1, 'Old Group', 'OLDGROUP')`, [past]);
    await query(`INSERT INTO score_sheet (id, event_id, group_id, half, judge_id) VALUES ('test-sheet-2026', $1, 'test-group-2026', 'defense', $2)`, [past, judgeId]);
    await query(`INSERT INTO score_value (sheet_id, criterion_key, value) VALUES ('test-sheet-2026', $1, 10)`, [criteriaOf(event.rubric, 'defense')[0].key]);
    // A sheet only started, never submitted, is not part of the judge's record (before: 2026 was listed).
    expect((await judgeEventProfile(event, judgeId))!.history).toEqual([]);
    await query(`UPDATE score_sheet SET status = 'complete', completed_at = now() WHERE id = 'test-sheet-2026'`);
    const later = (await judgeEventProfile(event, judgeId))!;
    expect(later.scoredHere).toBe(false);
    expect(later.history.map((h) => h.event.title)).toEqual(['Tambiz 2026']);
  });
});


// The one workbook in: its columns, the template, "Download current data", and the upload. The line that matters most
// is tested hardest: uploading never touches a score, and never removes anybody.
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.PGLITE_DIR = 'memory://';
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_POOLED;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
});

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ refresh: () => {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }));
vi.mock('@/lib/auth', () => {
  const admin = { id: 'test-coordinator', email: 'coordinator@tambiz.test', display_name: 'Test Coordinator', role: 'admin' };
  return { currentAccount: async () => admin, requireAccount: async () => admin, requireAdmin: async () => admin, requireJudge: async () => admin };
});

import { uploadWorkbook } from '@/app/admin/actions';
import { saveScoresTable } from '@/app/admin/table-actions';
import { GET as currentData } from '@/app/api/admin/events/[id]/data/route';
import { GET as template } from '@/app/api/admin/workbook-template/route';
import { buildDataWorkbook, ImportError, JUDGE_COLUMNS, parseWorkbook, planJudges, planStudents, STUDENT_COLUMNS, type ParsedSheet } from '@/lib/data-workbook';
import { one, query } from '@/lib/db';
import { LOCKED_SENT } from '@/lib/locks';
import { verifyPassword } from '@/lib/passwords';
import { eventReport, getEvent, type EventRow } from '@/lib/repo';
import { DEMO_ADMIN_EMAIL, PRACTICE_TITLE } from '@/lib/seed';

const sheet = (rows: Record<string, string>[], columns = STUDENT_COLUMNS.map((c) => c.field)): ParsedSheet => ({
  lines: rows.map((values, i) => ({ row: i + 2, values })),
  columns: new Set(columns),
});
const student = (n: string, group: string, adviser: string, extra: Record<string, string> = {}) => ({
  student_number: n,
  surname: 'Reyes',
  first_name: 'Ana',
  middle_name: '',
  section: 'Sec - 1',
  email: `s${n}@tambiz.test`,
  group,
  adviser,
  adviser_email: '',
  ...extra,
});

/** A workbook file from rows, the first row of each sheet being its headings. */
async function file(sheets: Record<string, string[][]>, name = 'upload.xlsx') {
  const wb = new ExcelJS.Workbook();
  for (const [title, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(title);
    rows.forEach((r) => ws.addRow(r));
  }
  return new File([await wb.xlsx.writeBuffer()], name);
}

async function upload(f: File) {
  const fd = new FormData();
  fd.set('file', f);
  return uploadWorkbook(event.id, null, fd);
}

let event: EventRow;
beforeAll(async () => {
  const row = await one<{ id: string }>('SELECT id FROM event WHERE title = $1', [PRACTICE_TITLE]);
  event = (await getEvent(row!.id))!;
});

/** Every score, correction, sheet and absence in the database, to compare before and after an upload. */
const everyScore = async () => ({
  sheets: await query('SELECT * FROM score_sheet ORDER BY id'),
  values: await query('SELECT * FROM score_value ORDER BY sheet_id, criterion_key'),
  members: await query('SELECT * FROM member_score ORDER BY sheet_id, student_id, field'),
});
const everyone = async () => ({
  students: await query<{ id: string }>('SELECT id FROM student ORDER BY id'),
  judges: await query<{ account_id: string }>('SELECT account_id FROM event_judge WHERE event_id = $1 ORDER BY account_id', [event.id]),
  accounts: await query<{ id: string }>('SELECT id FROM account ORDER BY id'),
});

describe('the column list is the only one: template, importer and current data agree', () => {
  it('the template has exactly the importer’s columns, one example row each, and reads back as that example', async () => {
    const res = await template();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    for (const [name, columns] of [
      ['Students', STUDENT_COLUMNS],
      ['Judges', JUDGE_COLUMNS],
    ] as const) {
      const ws = wb.getWorksheet(name)!;
      expect(ws.getRow(1).values).toEqual([undefined, ...columns.map((c) => c.header)]);
      expect(ws.rowCount).toBe(2);
    }
    expect(STUDENT_COLUMNS.filter((c) => c.required).map((c) => c.header)).toEqual(['Student No.', 'Surname', 'First Name', 'Email', 'Group', 'Adviser']);
    expect(STUDENT_COLUMNS.filter((c) => !c.required).map((c) => c.header)).toEqual(['Middle Name', 'Section', 'Adviser Email']);
    expect(JUDGE_COLUMNS.map((c) => [c.header, c.required])).toEqual([
      ['Name', true],
      ['Email', true],
      ['Password', false],
    ]);
    const parsed = await parseWorkbook((await buildDataWorkbook()) as unknown as ArrayBuffer);
    expect(parsed.students!.lines).toHaveLength(1);
    expect(parsed.judges!.lines).toHaveLength(1);
    expect(parsed.problems).toEqual([]);
  });

  it('a file without a Students or Judges sheet is refused, saying what the sheets need', async () => {
    await expect(parseWorkbook((await (await file({ Sheet1: [['Nothing', 'Here'], ['a', 'b']] })).arrayBuffer()) as ArrayBuffer)).rejects.toThrow(
      /no Students sheet and no Judges sheet\. Students needs the columns Student No\., Surname, First Name, Email, Group and Adviser/,
    );
    await expect(parseWorkbook((await (await file({ Students: [['Student No.', 'Surname']] })).arrayBuffer()) as ArrayBuffer)).rejects.toBeInstanceOf(ImportError);
  });

  it('sheets named differently are still found by their headings, and a row missing a required cell is skipped and said', async () => {
    const f = await file({
      'Class list': [
        ['Student No.', 'Surname', 'First Name', 'Email', 'Group', 'Adviser'],
        ['1', 'Cruz', 'Ben', 'ben@tambiz.test', 'PINILI', 'X, Y'],
        ['2', 'Cruz', 'Bea', 'bea@tambiz.test', '', 'X, Y'],
      ],
      Panel: [
        ['Name', 'Email'],
        ['Dr. A', 'a@tambiz.test'],
      ],
    });
    const parsed = await parseWorkbook((await f.arrayBuffer()) as ArrayBuffer);
    expect(parsed.students!.lines).toHaveLength(1);
    expect(parsed.judges!.lines).toHaveLength(1);
    expect(parsed.problems).toEqual(['Class list row 3 has no Group, so it was skipped.']);
    expect(parsed.students!.columns.has('section')).toBe(false);
  });
});

describe('planning the students sheet', () => {
  it('a group whose rows name different advisers is refused whole, naming the group and the rows that disagree', () => {
    const plan = planStudents(
      sheet([
        student('1', 'PINILI', 'REYES, ANA'),
        student('2', 'Pinili', 'reyes ana'),
        student('3', 'PINILI', 'CRUZ, BEN'),
        student('4', 'BUGA', 'CRUZ, BEN'),
      ]),
    );
    expect(plan.groups.map((g) => g.name)).toEqual(['BUGA']);
    expect(plan.students.map((s) => s.student_number)).toEqual(['4']);
    expect(plan.problems).toEqual([
      'Group PINILI was not imported: its rows name different advisers (rows 2 and 3 say REYES, ANA; row 4 says CRUZ, BEN). A group has one adviser, so every row of PINILI must name the same one. Correct the rows and upload again; nothing else about PINILI changed.',
    ]);
  });

  it('different adviser emails within a group refuse it the same way; an empty adviser email agrees with any', () => {
    const plan = planStudents(
      sheet([
        student('1', 'BUGA', 'CRUZ, BEN', { adviser_email: 'ben@tambiz.test' }),
        student('2', 'BUGA', 'CRUZ, BEN', { adviser_email: 'BEN@tambiz.test' }),
        student('3', 'BUGA', 'CRUZ, BEN'),
        student('4', 'PINILI', 'REYES, ANA', { adviser_email: 'ana@tambiz.test' }),
        student('5', 'PINILI', 'REYES, ANA', { adviser_email: 'ana.reyes@tambiz.test' }),
      ]),
    );
    expect(plan.groups.map((g) => g.name)).toEqual(['BUGA']);
    expect(plan.advisers).toEqual([{ key: 'CRUZBEN', name: 'CRUZ, BEN', email: 'ben@tambiz.test' }]);
    expect(plan.problems[0]).toMatch(/^Group PINILI was not imported: its rows give different adviser emails \(row 5 says ana@tambiz\.test; row 6 says ana\.reyes@tambiz\.test\)/);
  });

  it('an adviser may hold many groups; a student number twice uses the later row; a bad email skips its row', () => {
    const plan = planStudents(
      sheet([
        student('1', 'BUGA', 'CRUZ, BEN'),
        student('2', 'PINILI', 'CRUZ, BEN'),
        student('1', 'PINILI', 'CRUZ, BEN'),
        student('3', 'PINILI', 'CRUZ, BEN', { email: 'nope' }),
      ]),
    );
    expect(plan.groups.map((g) => [g.name, g.adviserKey])).toEqual([['PINILI', 'CRUZBEN']]);
    expect(plan.advisers).toHaveLength(1);
    expect(plan.students.map((s) => [s.student_number, s.group])).toEqual([
      ['2', 'PINILI'],
      ['1', 'PINILI'],
    ]);
    expect(plan.problems).toEqual(['Student No. 1 is on rows 2 and 4; row 4 was used.', 'Students row 5: “nope” is not an email address, so the row was skipped.']);
  });

  it('judges are one per email, capitals ignored, the later row winning; a password is kept exactly as typed', () => {
    const plan = planJudges(
      sheet(
        [
          { name: 'Dr. A', email: 'A@tambiz.test', password: '' },
          { name: 'Dr. A.', email: 'a@tambiz.test', password: 'Kape 2027!' },
        ],
        ['name', 'email', 'password'],
      ),
    );
    expect(plan.judges).toEqual([{ name: 'Dr. A.', email: 'a@tambiz.test', password: 'Kape 2027!' }]);
    expect(plan.problems).toEqual(['The judge a@tambiz.test is on Judges rows 2 and 3; row 3 was used.']);
  });
});

describe('uploading never touches a score and never removes anybody', () => {
  it('Download current data, uploaded straight back, changes nothing at all', async () => {
    const before = { scores: await everyScore(), people: await everyone(), data: await query('SELECT * FROM student ORDER BY id'), groups: await query('SELECT * FROM tgroup ORDER BY id') };
    const res = await currentData(new Request('http://localhost'), { params: Promise.resolve({ id: event.id }) });
    const result = await upload(new File([await res.arrayBuffer()], 'current.xlsx'));
    expect(result.ok).toBe(true);
    expect(result.message).toBe(
      'Uploaded current.xlsx: nothing needed changing. No one was removed and no score changed.',
    );
    expect(result.signIns).toEqual([]);
    expect(await everyScore()).toEqual(before.scores);
    expect(await everyone()).toEqual(before.people);
    expect(await query('SELECT * FROM student ORDER BY id')).toEqual(before.data);
    expect(await query('SELECT * FROM tgroup ORDER BY id')).toEqual(before.groups);
  });

  it('during judging, with corrections made: moves, new students, groups, advisers and judges leave every score exactly as it was', async () => {
    await query(`UPDATE event SET status = 'judging', released_at = NULL WHERE id = $1`, [event.id]);
    event = (await getEvent(event.id))!;
    // A coordinator correction first, so the check covers corrected scores too.
    const v = (await one<{ sheet_id: string; criterion_key: string; group_id: string }>(
      `SELECT v.sheet_id, v.criterion_key, s.group_id FROM score_value v JOIN score_sheet s ON s.id = v.sheet_id WHERE s.event_id = $1 AND s.status = 'complete' AND s.half = 'defense' LIMIT 1`,
      [event.id],
    ))!;
    expect((await saveScoresTable(event.id, v.group_id, 'defense', [{ rowId: `c:${v.criterion_key}`, key: v.sheet_id, value: '1' }], 'Judge confirmed 1')).notice).toMatch(/Corrected/);

    const scored = await query<{ student_number: string; group: string; adviser: string; surname: string; first_name: string; email: string; section: string }>(
      `SELECT s.student_number, s.surname, s.first_name, s.email, s.section, g.name AS "group", a.name AS adviser FROM member_score x JOIN student s ON s.id = x.student_id
       JOIN group_member m ON m.student_id = s.id JOIN tgroup g ON g.id = m.group_id JOIN adviser a ON a.id = g.adviser_id GROUP BY 1, 2, 3, 4, 5, 6, 7 ORDER BY 1 LIMIT 2`,
    );
    const judge = (await one<{ email: string; display_name: string; password_hash: string }>(
      `SELECT a.email, a.display_name, a.password_hash FROM account a JOIN event_judge j ON j.account_id = a.id WHERE j.event_id = $1 ORDER BY a.email LIMIT 1`,
      [event.id],
    ))!;
    const other = (await one<{ email: string; password_hash: string }>(
      `SELECT a.email, a.password_hash FROM account a JOIN event_judge j ON j.account_id = a.id WHERE j.event_id = $1 AND a.email <> $2 ORDER BY a.email LIMIT 1`,
      [event.id, judge.email],
    ))!;
    const before = { scores: await everyScore(), people: await everyone(), report: await eventReport(event) };

    const result = await upload(
      await file({
        Students: [
          ['Student No.', 'Surname', 'First Name', 'Email', 'Group', 'Adviser', 'Adviser Email'],
          // A scored student moved to a brand-new group with a new adviser; another scored student's name corrected.
          [scored[0].student_number, scored[0].surname, scored[0].first_name, scored[0].email, 'Bagong Grupo', 'LIM, JOSE', 'jose.lim@tambiz.test'],
          [scored[1].student_number, `${scored[1].surname}-Cruz`, scored[1].first_name, scored[1].email, scored[1].group.toLowerCase(), scored[1].adviser],
          ['2099111111', 'Tan', 'Mia', 'mia.tan@tambiz.test', 'Bagong Grupo', 'LIM, JOSE', ''],
          // A group whose rows disagree is refused whole; its scored student stays where they were.
          ['2099111112', 'Go', 'Leo', 'leo.go@tambiz.test', 'SPLIT', 'A, B', ''],
          ['2099111113', 'Go', 'Lia', 'lia.go@tambiz.test', 'SPLIT', 'C, D', ''],
        ],
        Judges: [
          ['Name', 'Email', 'Password'],
          [judge.display_name, judge.email.toUpperCase(), ''],
          ['Dr. New Judge', 'new.judge@tambiz.test', ''],
          ['Dr. Given Password', 'given@tambiz.test', 'palay-2027'],
          ['Existing With Password', other.email, 'reset-by-upload'],
          ['Not A Judge', DEMO_ADMIN_EMAIL, ''],
        ],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe(
      'Uploaded upload.xlsx: 1 new student, 1 student with changed details, 1 student moved to another group, 1 new group, 1 new adviser, 2 new judges, 1 judge’s password changed. No one was removed and no score changed.',
    );
    expect(result.problems).toEqual([
      expect.stringMatching(/^Group SPLIT was not imported: its rows name different advisers \(row 5 says A, B; row 6 says C, D\)/),
      `${DEMO_ADMIN_EMAIL} is a coordinator’s sign-in, so it was not made a judge.`,
    ]);

    // Not one score, correction, sheet or absence changed; nobody was removed.
    expect(await everyScore()).toEqual(before.scores);
    const after = await everyone();
    for (const k of ['students', 'judges', 'accounts'] as const) expect(after[k]).toEqual(expect.arrayContaining(before.people[k] as never[]));

    // The move and the new data are there.
    expect(await one(`SELECT g.name, a.name AS adviser, a.email FROM student s JOIN group_member m ON m.student_id = s.id JOIN tgroup g ON g.id = m.group_id JOIN adviser a ON a.id = g.adviser_id WHERE s.student_number = $1`, [scored[0].student_number])).toEqual({
      name: 'Bagong Grupo',
      adviser: 'LIM, JOSE',
      email: 'jose.lim@tambiz.test',
    });
    expect(await one('SELECT count(*)::int AS n FROM student WHERE student_number LIKE $1', ['209911111%'])).toEqual({ n: 1 });
    // A column the sheet does not have (Section here) keeps what the app had.
    expect(await one('SELECT section FROM student WHERE student_number = $1', [scored[1].student_number])).toEqual({ section: scored[1].section });

    // Passwords: shown once for the new judges and the one changed; a blank leaves an existing judge's alone.
    expect(result.signIns.map((s) => [s.name, s.login])).toEqual([
      ['Dr. New Judge', 'new.judge@tambiz.test'],
      ['Dr. Given Password', 'given@tambiz.test'],
      ['Existing With Password', other.email],
    ]);
    expect(result.signIns[1].password).toBe('palay-2027');
    const hashOf = async (email: string) => (await one<{ password_hash: string }>('SELECT password_hash FROM account WHERE lower(email) = $1', [email]))!.password_hash;
    expect(await hashOf(judge.email)).toBe(judge.password_hash);
    expect(await verifyPassword('palay-2027', await hashOf('given@tambiz.test'))).toBe(true);
    expect(await verifyPassword(result.signIns[0].password, await hashOf('new.judge@tambiz.test'))).toBe(true);
    expect(await verifyPassword('reset-by-upload', await hashOf(other.email))).toBe(true);
    expect(await query('SELECT password_hash FROM account WHERE password_hash LIKE $1', [`%${result.signIns[0].password}%`])).toEqual([]);

    // The old group's scores stay stored; the moved student's individual scores from it simply stop counting.
    const report = await eventReport(event);
    expect(report.sheets.map((s) => s.id).sort()).toEqual(before.report.sheets.map((s) => s.id).sort());
  });

  it('a group emptied by an upload is tidied away only if it has no score sheet', async () => {
    const scoredGroup = (await one<{ id: string; name: string; adviser: string }>(
      `SELECT g.id, g.name, a.name AS adviser FROM tgroup g JOIN adviser a ON a.id = g.adviser_id WHERE g.event_id = $1 AND EXISTS (SELECT 1 FROM score_sheet s WHERE s.group_id = g.id) ORDER BY g.name LIMIT 1`,
      [event.id],
    ))!;
    const members = await query<{ student_number: string; surname: string; first_name: string; email: string }>(
      'SELECT s.student_number, s.surname, s.first_name, s.email FROM group_member m JOIN student s ON s.id = m.student_id WHERE m.group_id = $1',
      [scoredGroup.id],
    );
    const before = await everyScore();
    const rows = (group: string) => [['Student No.', 'Surname', 'First Name', 'Email', 'Group', 'Adviser'], ...members.map((m) => [m.student_number, m.surname, m.first_name, m.email, group, scoredGroup.adviser])];
    expect((await upload(await file({ Students: rows('Somewhere Else') }))).ok).toBe(true);
    expect(await one('SELECT count(*)::int AS n FROM tgroup WHERE id = $1', [scoredGroup.id])).toEqual({ n: 1 });
    expect(await everyScore()).toEqual(before);
    // Back again: the unscored group they passed through is emptied and removed; the scored one was never deleted.
    expect((await upload(await file({ Students: rows(scoredGroup.name) }))).ok).toBe(true);
    expect(await one(`SELECT count(*)::int AS n FROM tgroup WHERE event_id = $1 AND name = 'Somewhere Else'`, [event.id])).toEqual({ n: 0 });
    expect(await everyScore()).toEqual(before);
  });

  it('is refused while the event is closed, and after the email file has been downloaded, changing nothing', async () => {
    const f = await file({ Students: [['Student No.', 'Surname', 'First Name', 'Email', 'Group', 'Adviser'], ['2099222222', 'Uy', 'Kim', 'kim@tambiz.test', 'PINILI', 'X, Y']] });
    const before = { scores: await everyScore(), people: await everyone() };
    await query(`UPDATE event SET status = 'finalised' WHERE id = $1`, [event.id]);
    expect(await upload(f)).toEqual({ ok: false, message: 'The event is closed. Undo closing on the Close tab first. Then upload again.', problems: [], signIns: [] });
    await query(`UPDATE event SET released_at = now() WHERE id = $1`, [event.id]);
    expect((await upload(f)).message).toBe(LOCKED_SENT);
    expect({ scores: await everyScore(), people: await everyone() }).toEqual(before);
    await query(`UPDATE event SET status = 'judging', released_at = NULL WHERE id = $1`, [event.id]);
  });

  it('a file that is not Excel is refused with a plain message', async () => {
    expect(await upload(new File(['hello'], 'notes.txt'))).toMatchObject({ ok: false, message: expect.stringMatching(/does not look like an Excel \.xlsx file/) });
  });
});

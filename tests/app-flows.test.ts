// The coordinator's and link holders' flows against a real Postgres: PGlite in memory, with the sample event.
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

import { acceptGroup, addMembers, correctScore, deleteGroup, excludeStudent, importAdvisers, includeStudent, removeMember, saveGroup, setMemberAbsent } from '@/app/admin/actions';
import { POST as mailing } from '@/app/api/admin/events/[id]/mailing/route';
import { one, query } from '@/lib/db';
import { buildWorkbook } from '@/lib/excel-export';
import { MAX_TRIES } from '@/lib/link-rules';
import { issueLinks, openLink } from '@/lib/links';
import { sha256 } from '@/lib/passwords';
import { judgeEventProfile } from '@/lib/profiles-data';
import { eventFinaliseChecks, eventReport, getEvent, groupScoreDetail, type EventRow } from '@/lib/repo';
import { criteriaOf } from '@/lib/rubric';

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
async function setEvent(status: EventRow['status'], released: boolean) {
  await query('UPDATE event SET status = $2, released_at = $3 WHERE id = $1', [event.id, status, released ? new Date() : null]);
  event = (await getEvent(event.id))!;
}

beforeAll(async () => {
  const row = await one<{ id: string }>(`SELECT id FROM event WHERE title = 'Tambiz 2027'`);
  event = (await getEvent(row!.id))!;
});

describe('private link tries (decision 8)', () => {
  async function newLink() {
    const s = (await one<{ id: string; email: string; student_number: string }>(
      'SELECT s.id, s.email, s.student_number FROM group_member m JOIN student s ON s.id = m.student_id WHERE m.event_id = $1 ORDER BY s.student_number LIMIT 1',
      [event.id],
    ))!;
    const [{ code }] = await issueLinks(event.id, [{ type: 'student', id: s.id, name: 'Test Student', email: s.email }]);
    return { s, code, hash: sha256(code) };
  }
  const linkRow = (hash: string) =>
    one(
      `SELECT l.failed_attempts, l.locked_at IS NOT NULL AS locked, l.open_count, (SELECT count(*)::int FROM link_session x WHERE x.link_id = l.id) AS sessions
       FROM access_link l WHERE l.code_hash = $1`,
      [hash],
    );

  it('guesses sent at the same moment share five tries, so the right number sent after them is refused', async () => {
    const { s, code, hash } = await newLink();
    const guesses = [...Array(11)].map((_, i) => `20990000${String(i).padStart(2, '0')}`);
    const results = await Promise.all([...guesses, s.student_number].map((g) => openLink(code, g)));
    expect(results.filter((r) => r.ok || r.state === 'wrong').length).toBeLessThan(MAX_TRIES);
    expect(results.at(-1)).toEqual({ ok: false, state: 'locked' });
    expect(await linkRow(hash)).toMatchObject({ locked: true, sessions: 0 });
  });

  it('the right number after four wrong tries opens the link and gives the tries back', async () => {
    const { s, code, hash } = await newLink();
    for (let i = 1; i < MAX_TRIES; i++) expect(await openLink(code, '2099999999')).toEqual({ ok: false, state: 'wrong', triesLeft: MAX_TRIES - i });
    expect(await openLink(code, s.student_number)).toEqual({ ok: true });
    expect(await linkRow(hash)).toEqual({ failed_attempts: 0, locked: false, open_count: 1, sessions: 1 });
  });

  it('a withdrawn or expired link opens for nobody, even with the right number', async () => {
    const first = await newLink();
    const { s, code, hash } = await newLink();
    expect(await openLink(first.code, first.s.student_number)).toEqual({ ok: false, state: 'revoked' });
    await query(`UPDATE access_link SET expires_at = now() - interval '1 minute' WHERE code_hash = $1`, [hash]);
    expect(await openLink(code, s.student_number)).toEqual({ ok: false, state: 'expired' });
    expect(await linkRow(hash)).toMatchObject({ sessions: 0 });
  });
});

describe('a score corrected to blank keeps its trace (decision 7)', () => {
  it('shows as corrected on the scores page and in the workbook, and the judge’s value survives a later correction', async () => {
    await setEvent('judging', false);
    const v = (await one<{ sheet_id: string; criterion_key: string; value: number; group_id: string }>(
      `SELECT v.sheet_id, v.criterion_key, v.value, s.group_id FROM score_value v JOIN score_sheet s ON s.id = v.sheet_id
       WHERE s.event_id = $1 AND s.half = 'defense' AND v.corrected_by IS NULL ORDER BY v.sheet_id, v.criterion_key LIMIT 1`,
      [event.id],
    ))!;
    const key = `c:${v.criterion_key}`;
    const judgeGave = Number(v.value);
    const correct = (value: string, reason: string) => act(correctScore, { eventId: event.id, sheetId: v.sheet_id, key, value, reason });

    expect((await correct('', 'Judge scored the wrong group')).ok).toMatch(/→ blank\.$/);

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

    expect((await correct('0', 'Judge confirmed a zero')).ok).toMatch(/blank → 0\.$/);
    expect((await eventReport(event)).corrections.get(v.sheet_id)).toContainEqual({ key, value: 0, judgeValue: judgeGave, reason: 'Judge confirmed a zero' });
    expect((await groupScoreDetail(event, v.group_id, 'defense')).removed.get(v.sheet_id)?.has(key) ?? false).toBe(false);
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
    await query(`INSERT INTO tgroup (id, event_id, code, name, name_key) VALUES ('test-group-2026', $1, 'G01', 'Old Group', 'oldgroup')`, [past]);
    await query(`INSERT INTO score_sheet (id, event_id, group_id, half, judge_id) VALUES ('test-sheet-2026', $1, 'test-group-2026', 'defense', $2)`, [past, judgeId]);
    await query(`INSERT INTO score_value (sheet_id, criterion_key, value) VALUES ('test-sheet-2026', $1, 10)`, [criteriaOf(event.rubric, 'defense')[0].key]);
    const later = (await judgeEventProfile(event, judgeId))!;
    expect(later.scoredHere).toBe(false);
    expect(later.history.map((h) => h.event.title)).toEqual(['Tambiz 2026']);
  });
});

describe('after release the roster stays as released', () => {
  it('leaving a student out, undoing it, and adding or removing members are refused', async () => {
    await setEvent('finalised', false);
    const [left, other] = await query<{ id: string }>(
      'SELECT s.id FROM student s WHERE s.event_id = $1 AND NOT EXISTS (SELECT 1 FROM group_member m WHERE m.student_id = s.id) ORDER BY s.student_number',
      [event.id],
    );
    expect((await act(excludeStudent, { eventId: event.id, studentId: left.id, reason: 'Dropped the course' })).ok).toMatch(/left out/);

    await setEvent('finalised', true);
    const member = (await one<{ group_id: string; student_id: string }>('SELECT group_id, student_id FROM group_member WHERE event_id = $1 LIMIT 1', [event.id]))!;
    const attempts: [Action, Record<string, string>][] = [
      [includeStudent, { studentId: left.id }],
      [excludeStudent, { studentId: other.id, reason: 'Transferred' }],
      [addMembers, { groupId: member.group_id, studentId: other.id }],
      [removeMember, { groupId: member.group_id, studentId: member.student_id }],
    ];
    for (const [fn, fields] of attempts) expect((await act(fn, { eventId: event.id, ...fields })).error).toMatch(/released/);

    expect(await query('SELECT id, excluded_reason FROM student WHERE id = ANY($1::text[]) ORDER BY id = $2 DESC', [[left.id, other.id], left.id])).toEqual([
      { id: left.id, excluded_reason: 'Dropped the course' },
      { id: other.id, excluded_reason: null },
    ]);
    expect(await one('SELECT count(*)::int AS n FROM group_member WHERE student_id = ANY($1::text[])', [[member.student_id, other.id]])).toEqual({ n: 1 });
  });
});

describe('after release a group can be corrected but not removed (14 September 2026)', () => {
  const changesFor = (groupId: string) =>
    query<{ account_id: string; created_at: Date; detail: { changes: string[]; released: boolean } }>(
      `SELECT account_id, created_at, detail FROM change_log WHERE event_id = $1 AND action = 'group.update' AND detail->>'groupId' = $2 ORDER BY created_at, id`,
      [event.id, groupId],
    );

  it('deleting a group and clearing a judge’s score to blank are refused', async () => {
    await setEvent('finalised', true);
    const empty = (await one<{ id: string }>('SELECT id FROM tgroup g WHERE event_id = $1 LIMIT 1', [event.id]))!;
    expect((await act(deleteGroup, { eventId: event.id, groupId: empty.id })).error).toMatch(/released, so a group cannot be deleted/);
    expect(await one('SELECT count(*)::int AS n FROM tgroup WHERE id = $1', [empty.id])).toEqual({ n: 1 });

    const score = (await one<{ sheet_id: string; criterion_key: string; value: number }>(
      'SELECT v.sheet_id, v.criterion_key, v.value FROM score_value v JOIN score_sheet s ON s.id = v.sheet_id WHERE s.event_id = $1 LIMIT 1',
      [event.id],
    ))!;
    const cleared = await act(correctScore, { eventId: event.id, sheetId: score.sheet_id, key: `c:${score.criterion_key}`, value: '', reason: 'Judge asked to remove it' });
    expect(cleared.error).toMatch(/released/);
    expect(await one('SELECT value FROM score_value WHERE sheet_id = $1 AND criterion_key = $2', [score.sheet_id, score.criterion_key])).toEqual({ value: score.value });
  });

  it('a new code, name or adviser is saved, recorded with who and when, and its consequence is said at once', async () => {
    await setEvent('finalised', true);
    const g = (await one<{ id: string; code: string; name: string; section: string; adviser_id: string | null }>(
      'SELECT id, code, name, section, adviser_id FROM tgroup WHERE event_id = $1 AND adviser_id IS NOT NULL ORDER BY code LIMIT 1',
      [event.id],
    ))!;
    const other = (await one<{ id: string; name: string }>('SELECT id, name FROM adviser WHERE event_id = $1 AND id <> $2 ORDER BY name LIMIT 1', [event.id, g.adviser_id]))!;
    const fields = { eventId: event.id, groupId: g.id, code: g.code, name: g.name, section: g.section, adviserId: g.adviser_id! };
    const before = (await changesFor(g.id)).length;

    expect((await act(saveGroup, { ...fields, section: `${g.section}X` })).error).toMatch(/section cannot change/);
    expect((await act(saveGroup, { ...fields, groupId: '', code: 'G99', name: 'Brand new' })).error).toMatch(/no new group/);

    const renamed = await act(saveGroup, { ...fields, name: `${g.name} Corrected` });
    expect(renamed.error).toBeNull();
    expect(renamed.ok).toMatch(/result pages now show the new code and name/);

    const moved = await act(saveGroup, { ...fields, name: `${g.name} Corrected`, adviserId: other.id });
    expect(moved.ok).toMatch(new RegExp(`→ ${other.name}`));
    expect(moved.ok).toMatch(/adviser ranking change, and the mailing sheet already sent no longer matches/);
    expect(await one('SELECT name, adviser_id FROM tgroup WHERE id = $1', [g.id])).toEqual({ name: `${g.name} Corrected`, adviser_id: other.id });

    const recorded = (await changesFor(g.id)).slice(before);
    expect(recorded.map((c) => [c.account_id, c.detail.changes, c.detail.released])).toEqual([
      ['test-coordinator', [`Name ${g.name} → ${g.name} Corrected`], true],
      ['test-coordinator', [expect.stringMatching(new RegExp(`^Adviser .+ → ${other.name}$`))], true],
    ]);
    expect(recorded.every((c) => c.created_at instanceof Date)).toBe(true);

    // The adviser import reassigning the group back is allowed too, recorded and warned about.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Advisers');
    const original = (await one<{ name: string }>('SELECT name FROM adviser WHERE id = $1', [g.adviser_id]))!;
    ws.addRow(['Adviser', 'Group Code']);
    ws.addRow([original.name, g.code]);
    const fd = new FormData();
    fd.set('eventId', event.id);
    fd.set('file', new File([await wb.xlsx.writeBuffer()], 'advisers.xlsx'));
    let imported = '';
    await importAdvisers(fd).catch((e: Error & { url?: string }) => (imported = new URL(e.url!, 'http://localhost').searchParams.get('ok') ?? ''));
    expect(imported).toMatch(new RegExp(`1 group changed adviser: ${g.code} \\(${other.name} → ${original.name}\\)`));
    expect(imported).toMatch(/mailing sheet already sent no longer matches/);
    expect(await one('SELECT adviser_id FROM tgroup WHERE id = $1', [g.id])).toEqual({ adviser_id: g.adviser_id });
    expect((await changesFor(g.id)).slice(before).map((c) => c.detail.changes)).toHaveLength(3);

    await act(saveGroup, { ...fields });
  });

  it('a group change whose history entry cannot be written is not saved either', async () => {
    await setEvent('finalised', true);
    const g = (await one<{ id: string; code: string; name: string; section: string; adviser_id: string | null }>(
      'SELECT id, code, name, section, adviser_id FROM tgroup WHERE event_id = $1 ORDER BY code LIMIT 1',
      [event.id],
    ))!;
    const before = (await changesFor(g.id)).length;
    // Make the history write fail, as a dropped connection would, after the group update has been sent.
    await query(`CREATE OR REPLACE FUNCTION refuse_group_log() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'group.update' THEN RAISE EXCEPTION 'history write failed'; END IF; RETURN NEW; END $$`);
    await query('CREATE TRIGGER refuse_group_log BEFORE INSERT ON change_log FOR EACH ROW EXECUTE FUNCTION refuse_group_log()');
    try {
      await expect(
        act(saveGroup, { eventId: event.id, groupId: g.id, code: g.code, name: `${g.name} Unrecorded`, section: g.section, adviserId: g.adviser_id ?? '' }),
      ).rejects.toThrow(/history write failed/);
    } finally {
      await query('DROP TRIGGER refuse_group_log ON change_log');
    }
    expect(await one('SELECT name FROM tgroup WHERE id = $1', [g.id])).toEqual({ name: g.name });
    expect(await changesFor(g.id)).toHaveLength(before);
  });
});

describe('releasing results (decisions 8 and 11)', () => {
  const release = () => {
    const fd = new FormData();
    fd.set('mode', 'release');
    fd.set('confirm', 'yes');
    return mailing(new Request(`http://localhost/api/admin/events/${event.id}/mailing`, { method: 'POST', body: fd }), { params: Promise.resolve({ id: event.id }) });
  };
  const blockers = async () => (await eventFinaliseChecks(await eventReport(event))).blockers;
  /** Settles every item the Progress page lists as Needs you, the way the coordinator would. */
  async function settle() {
    const report = await eventReport(event);
    for (const b of await blockers()) {
      const done =
        b.kind === 'group'
          ? await act(acceptGroup, { eventId: event.id, groupId: b.id, reason: 'Settled for the test' })
          : b.kind === 'student'
            ? await act(excludeStudent, { eventId: event.id, studentId: b.id, reason: 'Settled for the test' })
            : await act(setMemberAbsent, { eventId: event.id, groupId: report.grades.find((g) => g.student.id === b.id)!.group.id, studentId: b.id, absent: 'yes' });
      expect(done.error).toBeNull();
    }
    expect(await blockers()).toEqual([]);
  }

  it('is refused while something undone after judging closed needs the coordinator, and goes ahead once it is settled', async () => {
    await setEvent('finalised', false);
    await settle();
    await query('DELETE FROM access_link WHERE event_id = $1', [event.id]);
    const member = (await one<{ group_id: string; student_id: string }>('SELECT group_id, student_id FROM group_member WHERE event_id = $1 ORDER BY student_id LIMIT 1', [event.id]))!;
    expect((await act(removeMember, { eventId: event.id, groupId: member.group_id, studentId: member.student_id })).error).toBeNull();
    expect(await blockers()).toHaveLength(1);

    const refused = await release();
    expect(refused.status).toBe(303);
    const back = new URL(refused.headers.get('location')!);
    expect(back.pathname).toBe(`/admin/events/${event.id}/release`);
    expect(back.searchParams.get('error')).toBe('Results cannot be released yet: 1 item needs you first. They are listed under Close judging on the Progress tab.');
    expect(await one('SELECT released_at FROM event WHERE id = $1', [event.id])).toEqual({ released_at: null });
    expect(await one('SELECT count(*)::int AS n FROM access_link WHERE event_id = $1', [event.id])).toEqual({ n: 0 });

    await settle();
    expect((await release()).status).toBe(200);
    expect((await getEvent(event.id))!.released_at).not.toBeNull();
  });

  it('a post with an Origin of "null" or one that is not a web address is refused, not an error', async () => {
    for (const origin of ['null', 'not a url', 'https://elsewhere.example']) {
      const fd = new FormData();
      fd.set('mode', 'missing');
      const res = await mailing(new Request(`http://localhost/api/admin/events/${event.id}/mailing`, { method: 'POST', body: fd, headers: { origin, host: 'localhost' } }), {
        params: Promise.resolve({ id: event.id }),
      });
      expect(res.status).toBe(403);
    }
  });

  it('pressing release twice makes one set of links, and every link in the downloaded mailing sheet works', async () => {
    await setEvent('finalised', false);
    await settle();
    await query('DELETE FROM access_link WHERE event_id = $1', [event.id]);
    const answers = await Promise.all([release(), release()]);
    const sheets = answers.filter((r) => r.status === 200);
    const refused = answers.filter((r) => r.status === 303);
    expect([sheets.length, refused.length]).toEqual([1, 1]);
    expect(new URL(refused[0].headers.get('location')!).searchParams.get('error')).toMatch(/already released/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await sheets[0].arrayBuffer());
    const codes: string[] = [];
    wb.getWorksheet('Mailing')!.eachRow((row, n) => {
      if (n > 1) codes.push(String(row.getCell(3).value).split('/r/')[1]);
    });
    const live = await query<{ code_hash: string }>('SELECT code_hash FROM access_link WHERE event_id = $1 AND revoked_at IS NULL', [event.id]);
    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes.map(sha256))).toEqual(new Set(live.map((l) => l.code_hash)));
    expect(await one('SELECT count(*)::int AS n FROM access_link WHERE event_id = $1 AND revoked_at IS NOT NULL', [event.id])).toEqual({ n: 0 });
  });
});

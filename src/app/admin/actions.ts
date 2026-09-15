'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { logStatement } from '@/lib/change-log';
import { newId, one, query, transaction, type Statement } from '@/lib/db';
import { adviserChangeWarning, adviserWord, editGroup, removeGroup } from '@/lib/group-edit';
import { ADVISER_COLUMNS, ImportError, parseWorkbook, ROLL_COLUMNS } from '@/lib/excel-import';
import { generatePassword, hashPassword } from '@/lib/passwords';
import { eventFinaliseChecks, eventReport, getEvent, getGroup, listEvents } from '@/lib/repo';
import { HALVES, rubricForNewEvent, withCriterionWording } from '@/lib/rubric';
import { nameKey } from '@/lib/seed';
import { emailGivesAway, makeAdviserCode, MAX_TRIES, normaliseCheck } from '@/lib/link-rules';
import { applyCorrection } from '@/lib/score-correct';
import { fmtScore } from '@/lib/sheet';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

function back(path: string, msg: { ok?: string; error?: string }): never {
  const u = new URLSearchParams();
  if (msg.ok) u.set('ok', msg.ok);
  if (msg.error) u.set('error', msg.error);
  redirect(`${path}${path.includes('?') ? '&' : '?'}${u.toString()}`);
}


async function log(eventId: string | null, accountId: string, action: string, detail: object) {
  const { text, params } = logStatement(eventId, accountId, action, detail);
  await query(text, params);
}

async function eventOr404(eventId: string) {
  const e = await getEvent(eventId);
  if (!e) redirect('/admin');
  return e;
}

// ── events ────────────────────────────────────────────────────

export async function createEvent(fd: FormData) {
  const acc = await requireAdmin();
  const year = parseInt(s(fd, 'year'), 10);
  const title = s(fd, 'title') || `Tambiz ${year}`;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) back('/admin', { error: 'Type the year as four digits, for example 2027.' });
  // Start from the newest event's scoring sheet, copied so editing it can never change an old event,
  // with known misspellings corrected for the new event only ("Informercial" → "Infomercial", decision 12).
  const latest = (await listEvents())[0];
  const id = newId();
  await query(`INSERT INTO event (id, year, title, rubric) VALUES ($1, $2, $3, $4::jsonb)`, [id, year, title, JSON.stringify(rubricForNewEvent(latest?.rubric))]);
  await log(id, acc.id, 'event.create', { year, title });
  back(`/admin/events/${id}`, { ok: `Created ${title}.` });
}

export async function setEventStatus(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const status = s(fd, 'status');
  const progress = `/admin/events/${event.id}/progress`;
  if (!['setup', 'judging', 'finalised'].includes(status)) back(`/admin/events/${event.id}`, { error: 'Unknown status.' });
  if (event.released_at && status !== 'finalised') back(progress, { error: 'Results have been released, so judging cannot be reopened.' });
  if (status === 'finalised') {
    if (s(fd, 'confirm') !== 'yes') back(progress, { error: 'Tick the box to confirm before closing judging.' });
    // Decisions 5 and 6: every group fully judged or accepted, every student placed or left out, every member scored or absent.
    const { blockers } = await eventFinaliseChecks(await eventReport(event));
    if (blockers.length) back(progress, { error: `Judging cannot be closed yet: ${blockers.length} item${blockers.length === 1 ? ' needs' : 's need'} you first. They are listed under Close judging.` });
  }
  await query(`UPDATE event SET status = $2, finalised_at = CASE WHEN $2 = 'finalised' THEN now() ELSE NULL END WHERE id = $1`, [event.id, status]);
  await log(event.id, acc.id, 'event.status', { from: event.status, to: status });
  const words = { setup: 'Back in set-up.', judging: 'Judging is open. Judges can score.', finalised: 'Judging is closed. Scores are locked and results are final.' } as const;
  back(`/admin/events/${event.id}`, { ok: words[status as keyof typeof words] });
}

// ── finalising: accepted groups, students left out, absences (decisions 5 and 6) ──

const REASON_MAX = 200;
const reasonOf = (fd: FormData) => s(fd, 'reason').replace(/\s+/g, ' ').slice(0, REASON_MAX);
/** Where to return to: only paths inside this event are accepted. */
const returnTo = (fd: FormData, eventId: string, fallback: string) => {
  const r = s(fd, 'return');
  return r.startsWith(`/admin/events/${eventId}/`) && !r.includes('//') ? r : fallback;
};

export async function acceptGroup(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = returnTo(fd, event.id, `/admin/events/${event.id}/progress`);
  if (event.released_at) back(path, { error: 'Results have been released; nothing can change now.' });
  const reason = reasonOf(fd);
  if (reason.length < 3) back(path, { error: 'Type a short reason, for example “Did not run a booth”.' });
  const g = await one<{ name: string }>('UPDATE tgroup SET accept_reason = $3, accepted_at = now() WHERE id = $1 AND event_id = $2 RETURNING name', [s(fd, 'groupId'), event.id, reason]);
  if (!g) back(path, { error: 'Group not found.' });
  await log(event.id, acc.id, 'group.accept', { groupId: s(fd, 'groupId'), reason });
  back(path, { ok: `${g.name} will be finalised with the scores it has. Reason recorded.` });
}

export async function clearAcceptance(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = returnTo(fd, event.id, `/admin/events/${event.id}/progress`);
  if (event.released_at) back(path, { error: 'Results have been released; nothing can change now.' });
  await query('UPDATE tgroup SET accept_reason = NULL, accepted_at = NULL WHERE id = $1 AND event_id = $2', [s(fd, 'groupId'), event.id]);
  await log(event.id, acc.id, 'group.accept.clear', { groupId: s(fd, 'groupId') });
  back(path, { ok: 'Removed. That group again needs every score before judging can close.' });
}

export async function excludeStudent(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = returnTo(fd, event.id, `/admin/events/${event.id}/roll`);
  if (event.released_at) back(path, { error: 'Results have been released; nothing can change now.' });
  const reason = reasonOf(fd);
  if (reason.length < 3) back(path, { error: 'Type a short reason, for example “Dropped the course”.' });
  const st = await one<{ first_name: string; surname: string }>(
    `UPDATE student SET excluded_reason = $3, excluded_at = now() WHERE id = $1 AND event_id = $2
       AND NOT EXISTS (SELECT 1 FROM group_member m WHERE m.student_id = student.id) RETURNING first_name, surname`,
    [s(fd, 'studentId'), event.id, reason],
  );
  if (!st) back(path, { error: 'That student is in a group. Remove them from the group first.' });
  await log(event.id, acc.id, 'student.exclude', { studentId: s(fd, 'studentId'), reason });
  back(path, { ok: `${st.first_name} ${st.surname} is left out of every group. Reason recorded.` });
}

export async function includeStudent(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = returnTo(fd, event.id, `/admin/events/${event.id}/roll`);
  if (event.released_at) back(path, { error: 'Results have been released; nothing can change now.' });
  await query('UPDATE student SET excluded_reason = NULL, excluded_at = NULL WHERE id = $1 AND event_id = $2', [s(fd, 'studentId'), event.id]);
  await log(event.id, acc.id, 'student.include', { studentId: s(fd, 'studentId') });
  back(path, { ok: 'Undone. Place this student in a group before judging closes.' });
}

export async function setMemberAbsent(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const path = returnTo(fd, event.id, `/admin/events/${event.id}/groups/${groupId}`);
  if (event.released_at) back(path, { error: 'Results have been released; nothing can change now.' });
  const absent = s(fd, 'absent') === 'yes';
  const row = await one<{ student_id: string }>(
    `UPDATE group_member SET absent_at = CASE WHEN $4::boolean THEN coalesce(absent_at, now()) ELSE NULL END, absent_by = CASE WHEN $4::boolean THEN $5 ELSE NULL END
     WHERE event_id = $1 AND group_id = $2 AND student_id = $3 RETURNING student_id`,
    [event.id, groupId, s(fd, 'studentId'), absent, acc.id],
  );
  if (!row) back(path, { error: 'That student is not in this group.' });
  await log(event.id, acc.id, absent ? 'member.absent' : 'member.present', { groupId, studentId: row.student_id });
  back(path, { ok: absent ? 'Marked absent from the defense. Their grade will be blank in the workbook for you to enter.' : 'Marked present. They need member scores from the defense judges.' });
}

// ── coordinator corrections (decision 7) ──────────────────────

export async function correctScore(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const res = await applyCorrection(event, acc.id, s(fd, 'sheetId'), s(fd, 'key'), s(fd, 'value'), reasonOf(fd));
  const path = res.group ? `/admin/events/${event.id}/groups/${res.group}/scores?half=${res.half}` : `/admin/events/${event.id}/progress`;
  if (!res.ok) back(path, { error: res.error });
  const show = (v: number | null) => (v === null ? 'blank' : fmtScore(v));
  back(path, { ok: `Corrected ${res.label} for ${res.judge}: ${show(res.from)} → ${show(res.to)}.` });
}

// ── scoring sheet wording ─────────────────────────────────────

export async function saveCriteria(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const { rubric, worded } = withCriterionWording(event.rubric, (field) => (fd.has(field) ? String(fd.get(field)) : null));
  await query('UPDATE event SET rubric = $2::jsonb WHERE id = $1', [event.id, JSON.stringify(rubric)]);
  await log(event.id, acc.id, 'rubric.wording', { worded });
  const total = HALVES.reduce((n, h) => n + rubric.halves[h].categories.reduce((m, c) => m + c.maxes.length, 0), 0);
  back(`/admin/events/${event.id}/sheet`, { ok: `Wording saved: ${worded} of ${total} criteria have wording. Judges see it the next time they open a group.` });
}

// ── groups and members ────────────────────────────────────────
// The Groups table saves through table-actions.ts; these forms share its rules (lib/group-edit.ts).

export async function saveGroup(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const path = groupId ? `/admin/events/${event.id}/groups/${groupId}` : `/admin/events/${event.id}/groups`;
  const before = groupId ? await getGroup(event.id, groupId) : null;
  if (groupId && !before) back(`/admin/events/${event.id}/groups`, { error: 'Group not found.' });
  const res = await editGroup(event, acc.id, before, { name: s(fd, 'name'), section: s(fd, 'section'), adviser: s(fd, 'adviserName') || s(fd, 'adviserId') });
  if (!res.ok) back(path, { error: res.error });
  back(res.created ? `/admin/events/${event.id}/groups/${res.group.id}` : path, { ok: res.message });
}

export async function deleteGroup(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const refused = await removeGroup(event, acc.id, groupId);
  if (refused) back(`/admin/events/${event.id}/groups/${groupId}`, { error: refused });
  back(`/admin/events/${event.id}/groups`, { ok: 'Group deleted.' });
}

export async function addMembers(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const path = `/admin/events/${event.id}/groups/${groupId}`;
  if (event.released_at) back(path, { error: 'Results have been released; nothing can change now.' });
  const ids = fd.getAll('studentId').map(String).filter(Boolean);
  if (!ids.length) back(path, { error: 'Tick at least one student to add.' });
  const taken = await query<{ first_name: string; surname: string; group_name: string }>(
    `SELECT s.first_name, s.surname, g.name AS group_name FROM group_member m JOIN student s ON s.id = m.student_id JOIN tgroup g ON g.id = m.group_id
     WHERE m.event_id = $1 AND m.student_id = ANY($2::text[]) AND m.group_id <> $3`,
    [event.id, ids, groupId],
  );
  if (taken.length) back(path, { error: `Already in another group: ${taken.map((t) => `${t.first_name} ${t.surname} (${t.group_name})`).join(', ')}. A student can belong to only one group.` });
  const valid = await query<{ id: string }>('SELECT id FROM student WHERE event_id = $1 AND id = ANY($2::text[])', [event.id, ids]);
  await transaction([
    ...valid.map((v) => ({ text: 'INSERT INTO group_member (event_id, group_id, student_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', params: [event.id, groupId, v.id] })),
    // A student placed in a group is no longer left out.
    { text: 'UPDATE student SET excluded_reason = NULL, excluded_at = NULL WHERE event_id = $1 AND id = ANY($2::text[])', params: [event.id, valid.map((v) => v.id)] },
  ]);
  await log(event.id, acc.id, 'member.add', { groupId, students: ids });
  back(path, { ok: `Added ${valid.length} member${valid.length === 1 ? '' : 's'}.` });
}

export async function removeMember(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const studentId = s(fd, 'studentId');
  if (event.released_at) back(`/admin/events/${event.id}/groups/${groupId}`, { error: 'Results have been released; nothing can change now.' });
  await query('DELETE FROM group_member WHERE event_id = $1 AND group_id = $2 AND student_id = $3', [event.id, groupId, studentId]);
  await log(event.id, acc.id, 'member.remove', { groupId, studentId });
  back(`/admin/events/${event.id}/groups/${groupId}`, { ok: 'Member removed from the group. Their scores from this group no longer count.' });
}

// ── imports ───────────────────────────────────────────────────

async function readUpload(fd: FormData, path: string) {
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) back(path, { error: 'Choose an Excel file first.' });
  return { name: file.name, buffer: await file.arrayBuffer() };
}

export async function importRoll(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = `/admin/events/${event.id}/roll`;
  const { name, buffer } = await readUpload(fd, path);
  let parsed;
  try {
    parsed = await parseWorkbook(buffer, ROLL_COLUMNS, 'class roll');
  } catch (e) {
    if (e instanceof ImportError) back(path, { error: e.message });
    throw e;
  }
  // Same student number twice in the file: the later row wins, and it is reported.
  const byNumber = new Map<string, Record<string, string>>();
  const problems = [...parsed.problems];
  for (const r of parsed.rows) {
    const num = r.values.student_number.replace(/\s+/g, '');
    if (byNumber.has(num)) problems.push(`Student No. ${num} appears more than once; the last row was used.`);
    byNumber.set(num, { ...r.values, student_number: num });
  }
  const existing = new Set((await query<{ student_number: string }>('SELECT student_number FROM student WHERE event_id = $1', [event.id])).map((r) => r.student_number));
  const statements: Statement[] = [];
  const all = [...byNumber.values()];
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    const params: unknown[] = [];
    const tuples = chunk.map((v) => {
      const vals = [newId(), event.id, v.student_number, v.email, v.surname, v.first_name, v.middle_name, v.section.toUpperCase(), v.sex, v.program_code, v.course_code, v.faculty];
      return `(${vals.map((x) => (params.push(x ?? ''), `$${params.length}`)).join(', ')})`;
    });
    statements.push({
      text: `INSERT INTO student (id, event_id, student_number, email, surname, first_name, middle_name, section, sex, program_code, course_code, faculty)
             VALUES ${tuples.join(', ')}
             ON CONFLICT (event_id, student_number) DO UPDATE SET email = EXCLUDED.email, surname = EXCLUDED.surname, first_name = EXCLUDED.first_name,
               middle_name = EXCLUDED.middle_name, section = EXCLUDED.section, sex = EXCLUDED.sex, program_code = EXCLUDED.program_code,
               course_code = EXCLUDED.course_code, faculty = EXCLUDED.faculty`,
      params,
    });
  }
  const added = all.filter((v) => !existing.has(v.student_number)).length;
  const updated = all.length - added;
  statements.push({
    text: 'INSERT INTO roll_import (id, event_id, kind, file_name, row_count, added, updated) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    params: [newId(), event.id, 'roll', name, all.length, added, updated],
  });
  await transaction(statements);
  await log(event.id, acc.id, 'roll.import', { file: name, added, updated });
  const msg = `Imported ${all.length} student${all.length === 1 ? '' : 's'} from ${name}: ${added} new, ${updated} already on the roll and updated.`;
  back(path, { ok: problems.length ? `${msg} ${problems.slice(0, 8).join(' ')}${problems.length > 8 ? ` …and ${problems.length - 8} more.` : ''}` : msg });
}

export async function importAdvisers(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = `/admin/events/${event.id}/advisers`;
  const { name, buffer } = await readUpload(fd, path);
  let parsed;
  try {
    parsed = await parseWorkbook(buffer, ADVISER_COLUMNS, 'adviser list');
  } catch (e) {
    if (e instanceof ImportError) back(path, { error: e.message });
    throw e;
  }
  const groups = await query<{ id: string; name: string; name_key: string; adviser_id: string | null }>('SELECT id, name, name_key, adviser_id FROM tgroup WHERE event_id = $1', [event.id]);
  const existing = await query<{ id: string; name: string; name_key: string }>('SELECT id, name, name_key FROM adviser WHERE event_id = $1', [event.id]);
  const idByKey = new Map(existing.map((a) => [a.name_key, a.id]));
  const nameById = new Map(existing.map((a) => [a.id, a.name]));
  const problems = [...parsed.problems];
  const statements: Statement[] = [];
  const reassigned: string[] = [];
  const released = !!event.released_at;
  let added = 0;
  let linked = 0;
  // Groups are matched by name. A Group Code column from an older file is read only to say it no longer sets anything.
  let codeOnly = 0;
  const seen = new Set<string>();
  for (const r of parsed.rows) {
    const key = nameKey(r.values.name);
    let id = idByKey.get(key);
    const adviserCode = cleanCode(r.values.link_code ?? '');
    if (!id) {
      id = newId();
      idByKey.set(key, id);
      nameById.set(id, r.values.name);
      added++;
      statements.push({ text: 'INSERT INTO adviser (id, event_id, name, name_key, email, link_code) VALUES ($1, $2, $3, $4, $5, $6)', params: [id, event.id, r.values.name, key, r.values.email, adviserCode] });
    } else if (!seen.has(key) && r.values.email) {
      statements.push({ text: 'UPDATE adviser SET email = $2, name = $3 WHERE id = $1', params: [id, r.values.email, r.values.name] });
    }
    if (adviserCode && !seen.has(key)) statements.push({ text: 'UPDATE adviser SET link_code = $2 WHERE id = $1', params: [id, adviserCode] });
    seen.add(key);
    const gkey = nameKey(r.values.group_name);
    if (!gkey && r.values.group_code) codeOnly++;
    if (gkey) {
      const g = groups.find((x) => x.name_key === gkey);
      if (g) {
        statements.push({ text: 'UPDATE tgroup SET adviser_id = $2 WHERE id = $1', params: [g.id, id] });
        linked++;
        if (g.adviser_id !== id) {
          const change = `Adviser ${adviserWord(g.adviser_id ? nameById.get(g.adviser_id) : null)} → ${adviserWord(nameById.get(id))}`;
          reassigned.push(`${g.name} (${change.slice('Adviser '.length)})`);
          statements.push(logStatement(event.id, acc.id, 'group.update', { groupId: g.id, adviserId: id, from: { adviserId: g.adviser_id }, changes: [change], released, file: name }));
          g.adviser_id = id;
        }
      } else problems.push(`Row ${r.rowNumber}: no group called ${r.values.group_name} in this event.`);
    }
  }
  if (codeOnly) {
    problems.unshift(
      `${codeOnly} row${codeOnly === 1 ? ' has' : 's have'} a Group Code but no Group Name. Groups are matched by their name now, so add a Group Name column to set ${codeOnly === 1 ? 'that group’s' : 'those groups’'} adviser.`,
    );
  }
  statements.push({
    text: 'INSERT INTO roll_import (id, event_id, kind, file_name, row_count, added, updated) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    params: [newId(), event.id, 'advisers', name, parsed.rows.length, added, seen.size - added],
  });
  await transaction(statements);
  await log(event.id, acc.id, 'advisers.import', { file: name, added, linked, reassigned: reassigned.length });
  let msg = `Read ${seen.size} adviser${seen.size === 1 ? '' : 's'} from ${name}: ${added} new. ${linked} group${linked === 1 ? '' : 's'} given an adviser.`;
  if (released && reassigned.length) {
    msg += ` ${reassigned.length} group${reassigned.length === 1 ? '' : 's'} changed adviser: ${reassigned.join(', ')}. ${adviserChangeWarning('those advisers’')} Each change is recorded with your name and the time.`;
  }
  back(path, { ok: problems.length ? `${msg} ${problems.slice(0, 8).join(' ')}` : msg });
}

export async function addAdviser(fd: FormData) {
  await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const name = s(fd, 'name');
  if (!name) back(`/admin/events/${event.id}/advisers`, { error: 'Type the adviser’s name.' });
  const key = nameKey(name);
  await query('INSERT INTO adviser (id, event_id, name, name_key, email) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id, name_key) DO UPDATE SET email = EXCLUDED.email', [
    newId(),
    event.id,
    name,
    key,
    s(fd, 'email'),
  ]);
  back(`/admin/events/${event.id}/advisers`, { ok: `Saved ${name}.` });
}

// ── adviser codes and links (decision 8) ──────────────────────

/** An adviser code as stored: capitals, spaces removed. Checking ignores dashes and case anyway. */
const cleanCode = (v: string) => v.toUpperCase().replace(/\s+/g, '').slice(0, 20);

export async function setAdviserCode(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = `/admin/events/${event.id}/advisers`;
  const code = cleanCode(s(fd, 'code'));
  const adviser = await one<{ id: string; name: string; email: string }>('SELECT id, name, email FROM adviser WHERE id = $1 AND event_id = $2', [s(fd, 'adviserId'), event.id]);
  if (!adviser) back(path, { error: 'Adviser not found.' });
  if (code && normaliseCheck(code).length < 4) back(path, { error: 'Use at least four letters or numbers, for example K7Q-4MP.' });
  if (code && emailGivesAway(adviser.email, code)) back(path, { error: `${adviser.name}’s email contains that code, so it would not protect the link. Choose another.` });
  if (code) {
    const others = await query<{ link_code: string }>(`SELECT link_code FROM adviser WHERE event_id = $1 AND id <> $2 AND link_code <> ''`, [event.id, adviser.id]);
    if (others.some((o) => normaliseCheck(o.link_code) === normaliseCheck(code))) back(path, { error: 'Another adviser already has that code.' });
  }
  await query('UPDATE adviser SET link_code = $2 WHERE id = $1', [adviser.id, code]);
  await log(event.id, acc.id, 'adviser.code', { adviserId: adviser.id, set: !!code });
  back(path, { ok: code ? `${adviser.name}’s code is ${code}.` : `Removed ${adviser.name}’s code.` });
}

export async function makeAdviserCodes(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const all = await query<{ id: string; link_code: string }>('SELECT id, link_code FROM adviser WHERE event_id = $1', [event.id]);
  const used = new Set(all.map((a) => normaliseCheck(a.link_code)).filter(Boolean));
  const statements: Statement[] = [];
  for (const a of all.filter((x) => !x.link_code.trim())) {
    let code = makeAdviserCode();
    while (used.has(normaliseCheck(code))) code = makeAdviserCode();
    used.add(normaliseCheck(code));
    statements.push({ text: 'UPDATE adviser SET link_code = $2 WHERE id = $1', params: [a.id, code] });
  }
  await transaction(statements);
  await log(event.id, acc.id, 'adviser.codes', { made: statements.length });
  back(`/admin/events/${event.id}/advisers`, { ok: statements.length ? `Made codes for ${statements.length} adviser${statements.length === 1 ? '' : 's'}.` : 'Every adviser already has a code.' });
}

export async function unlockLink(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  await query('UPDATE access_link SET locked_at = NULL, failed_attempts = 0 WHERE id = $1 AND event_id = $2', [s(fd, 'linkId'), event.id]);
  await log(event.id, acc.id, 'link.unlock', { linkId: s(fd, 'linkId') });
  back(`/admin/events/${event.id}/release`, { ok: `Unlocked. The link can be tried again (${MAX_TRIES} tries).` });
}

// ── judges ────────────────────────────────────────────────────

async function flashPassword(eventId: string, email: string, password: string) {
  (await cookies()).set('tambiz_flash', JSON.stringify({ email, password }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: `/admin/events/${eventId}/judges`,
    maxAge: 120,
  });
}

export async function createJudge(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = `/admin/events/${event.id}/judges`;
  const email = s(fd, 'email').toLowerCase();
  const name = s(fd, 'name');
  if (!email || !name) back(path, { error: 'A judge needs a name and an email or short login.' });
  const existing = await one<{ id: string; role: string }>('SELECT id, role FROM account WHERE lower(email) = $1', [email]);
  if (existing) {
    if (existing.role !== 'judge') back(path, { error: 'That login belongs to a coordinator account.' });
    await query('INSERT INTO event_judge (event_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [event.id, existing.id]);
    await query('UPDATE account SET disabled_at = NULL WHERE id = $1', [existing.id]);
    back(path, { ok: `${email} already had an account and is now a judge for ${event.title}. Their password is unchanged; use Reset password if they forgot it.` });
  }
  const password = generatePassword();
  const id = newId();
  await transaction([
    { text: `INSERT INTO account (id, email, display_name, role, password_hash) VALUES ($1, $2, $3, 'judge', $4)`, params: [id, email, name, await hashPassword(password)] },
    { text: 'INSERT INTO event_judge (event_id, account_id) VALUES ($1, $2)', params: [event.id, id] },
  ]);
  await log(event.id, acc.id, 'judge.create', { id, email });
  await flashPassword(event.id, email, password);
  back(path, { ok: `Created a judge account for ${name}.` });
}

/** Picks a judge from the department's standing list for this event; their record in Judge profiles carries on. */
export async function addExistingJudge(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = `/admin/events/${event.id}/judges`;
  const judge = await one<{ id: string; display_name: string }>(`SELECT id, display_name FROM account WHERE id = $1 AND role = 'judge'`, [s(fd, 'accountId')]);
  if (!judge) back(path, { error: 'Judge not found.' });
  await transaction([
    { text: 'INSERT INTO event_judge (event_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', params: [event.id, judge.id] },
    { text: 'UPDATE account SET disabled_at = NULL WHERE id = $1', params: [judge.id] },
  ]);
  await log(event.id, acc.id, 'judge.add', { id: judge.id });
  back(path, { ok: `${judge.display_name} is now a judge for ${event.title}. Their password is unchanged; use Reset password if they have forgotten it.` });
}

export async function resetJudgePassword(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const judge = await one<{ id: string; email: string }>(
    `SELECT a.id, a.email FROM account a JOIN event_judge j ON j.account_id = a.id AND j.event_id = $2 WHERE a.id = $1 AND a.role = 'judge'`,
    [s(fd, 'accountId'), event.id],
  );
  if (!judge) back(`/admin/events/${event.id}/judges`, { error: 'Judge not found.' });
  const password = generatePassword();
  await transaction([
    { text: 'UPDATE account SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1', params: [judge.id, await hashPassword(password)] },
    { text: 'DELETE FROM session WHERE account_id = $1', params: [judge.id] },
  ]);
  await log(event.id, acc.id, 'judge.reset', { id: judge.id });
  await flashPassword(event.id, judge.email, password);
  back(`/admin/events/${event.id}/judges`, { ok: 'Password reset. The judge is signed out everywhere.' });
}

export async function removeJudge(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const accountId = s(fd, 'accountId');
  await query('DELETE FROM event_judge WHERE event_id = $1 AND account_id = $2', [event.id, accountId]);
  await log(event.id, acc.id, 'judge.remove', { accountId });
  back(`/admin/events/${event.id}/judges`, { ok: 'Removed from this event. Scores they already gave still count; they can no longer sign in to score.' });
}

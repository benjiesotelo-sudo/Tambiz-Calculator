'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { newId, one, query, transaction, type Statement } from '@/lib/db';
import { ADVISER_COLUMNS, ImportError, parseWorkbook, ROLL_COLUMNS } from '@/lib/excel-import';
import { generatePassword, hashPassword } from '@/lib/passwords';
import { getEvent, listEvents } from '@/lib/repo';
import { DEFAULT_RUBRIC, HALVES, withCriterionWording } from '@/lib/rubric';
import { nameKey } from '@/lib/seed';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

function back(path: string, msg: { ok?: string; error?: string }): never {
  const u = new URLSearchParams();
  if (msg.ok) u.set('ok', msg.ok);
  if (msg.error) u.set('error', msg.error);
  redirect(`${path}${path.includes('?') ? '&' : '?'}${u.toString()}`);
}

const isUnique = (e: unknown) => (e as { code?: string })?.code === '23505';

async function log(eventId: string | null, accountId: string, action: string, detail: object) {
  await query('INSERT INTO change_log (id, event_id, account_id, action, detail) VALUES ($1, $2, $3, $4, $5::jsonb)', [newId(), eventId, accountId, action, JSON.stringify(detail)]);
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
  // Start from the newest event's scoring sheet, copied so editing it can never change an old event.
  const latest = (await listEvents())[0];
  const id = newId();
  await query(`INSERT INTO event (id, year, title, rubric) VALUES ($1, $2, $3, $4::jsonb)`, [id, year, title, JSON.stringify(latest?.rubric ?? DEFAULT_RUBRIC)]);
  await log(id, acc.id, 'event.create', { year, title });
  back(`/admin/events/${id}`, { ok: `Created ${title}.` });
}

export async function setEventStatus(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const status = s(fd, 'status');
  if (!['setup', 'judging', 'finalised'].includes(status)) back(`/admin/events/${event.id}`, { error: 'Unknown status.' });
  if (status === 'finalised' && s(fd, 'confirm') !== 'yes') back(`/admin/events/${event.id}/progress`, { error: 'Tick the box to confirm before closing judging.' });
  await query(`UPDATE event SET status = $2, finalised_at = CASE WHEN $2 = 'finalised' THEN now() ELSE NULL END WHERE id = $1`, [event.id, status]);
  await log(event.id, acc.id, 'event.status', { from: event.status, to: status });
  const words = { setup: 'Back in set-up.', judging: 'Judging is open. Judges can score.', finalised: 'Judging is closed. Scores are locked and results are final.' } as const;
  back(`/admin/events/${event.id}`, { ok: words[status as keyof typeof words] });
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

async function adviserIdFor(eventId: string, fd: FormData): Promise<string | null> {
  const chosen = s(fd, 'adviserId');
  const typed = s(fd, 'adviserName');
  if (typed) {
    const key = nameKey(typed);
    const existing = await one<{ id: string }>('SELECT id FROM adviser WHERE event_id = $1 AND name_key = $2', [eventId, key]);
    if (existing) return existing.id;
    const id = newId();
    await query('INSERT INTO adviser (id, event_id, name, name_key) VALUES ($1, $2, $3, $4)', [id, eventId, typed, key]);
    return id;
  }
  return chosen || null;
}

export async function saveGroup(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const code = s(fd, 'code').toUpperCase();
  const name = s(fd, 'name');
  const section = s(fd, 'section').toUpperCase();
  const path = groupId ? `/admin/events/${event.id}/groups/${groupId}` : `/admin/events/${event.id}/groups`;
  if (!code || !name) back(path, { error: 'A group needs a code and a name.' });
  const key = nameKey(name);
  if (!key) back(path, { error: 'The group name needs at least one letter or number.' });
  const clash = await one<{ code: string; name: string; id: string }>(
    'SELECT id, code, name FROM tgroup WHERE event_id = $1 AND (code = $2 OR name_key = $3) AND id <> $4',
    [event.id, code, key, groupId || ''],
  );
  if (clash) back(path, { error: clash.code === code ? `Code ${code} is already used by ${clash.name}.` : `“${name}” is the same name as ${clash.code} ${clash.name} (spacing and punctuation are ignored).` });
  const adviserId = await adviserIdFor(event.id, fd);
  try {
    if (groupId) {
      await query('UPDATE tgroup SET code = $3, name = $4, name_key = $5, section = $6, adviser_id = $7 WHERE id = $1 AND event_id = $2', [groupId, event.id, code, name, key, section, adviserId]);
      await log(event.id, acc.id, 'group.update', { groupId, code, name, section });
      back(path, { ok: 'Group saved.' });
    }
    const id = newId();
    await query('INSERT INTO tgroup (id, event_id, code, name, name_key, section, adviser_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, event.id, code, name, key, section, adviserId]);
    await log(event.id, acc.id, 'group.create', { id, code, name, section });
    back(`/admin/events/${event.id}/groups/${id}`, { ok: `Created ${code} ${name}. Now add its members.` });
  } catch (e) {
    if (isUnique(e)) back(path, { error: 'Another group already has that code or name.' });
    throw e;
  }
}

export async function deleteGroup(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const sheets = await one<{ n: number }>('SELECT count(*)::int AS n FROM score_sheet WHERE group_id = $1', [groupId]);
  if (sheets && sheets.n > 0) back(`/admin/events/${event.id}/groups/${groupId}`, { error: 'This group already has scores, so it cannot be deleted.' });
  await query('DELETE FROM tgroup WHERE id = $1 AND event_id = $2', [groupId, event.id]);
  await log(event.id, acc.id, 'group.delete', { groupId });
  back(`/admin/events/${event.id}/groups`, { ok: 'Group deleted.' });
}

export async function addMembers(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const path = `/admin/events/${event.id}/groups/${groupId}`;
  const ids = fd.getAll('studentId').map(String).filter(Boolean);
  if (!ids.length) back(path, { error: 'Tick at least one student to add.' });
  const taken = await query<{ first_name: string; surname: string; code: string }>(
    `SELECT s.first_name, s.surname, g.code FROM group_member m JOIN student s ON s.id = m.student_id JOIN tgroup g ON g.id = m.group_id
     WHERE m.event_id = $1 AND m.student_id = ANY($2::text[]) AND m.group_id <> $3`,
    [event.id, ids, groupId],
  );
  if (taken.length) back(path, { error: `Already in another group: ${taken.map((t) => `${t.first_name} ${t.surname} (${t.code})`).join(', ')}. A student can belong to only one group.` });
  const valid = await query<{ id: string }>('SELECT id FROM student WHERE event_id = $1 AND id = ANY($2::text[])', [event.id, ids]);
  await transaction(
    valid.map((v) => ({ text: 'INSERT INTO group_member (event_id, group_id, student_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', params: [event.id, groupId, v.id] })),
  );
  await log(event.id, acc.id, 'member.add', { groupId, students: ids });
  back(path, { ok: `Added ${valid.length} member${valid.length === 1 ? '' : 's'}.` });
}

export async function removeMember(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const studentId = s(fd, 'studentId');
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
  const groups = await query<{ id: string; code: string; name_key: string }>('SELECT id, code, name_key FROM tgroup WHERE event_id = $1', [event.id]);
  const existing = await query<{ id: string; name_key: string }>('SELECT id, name_key FROM adviser WHERE event_id = $1', [event.id]);
  const idByKey = new Map(existing.map((a) => [a.name_key, a.id]));
  const problems = [...parsed.problems];
  const statements: Statement[] = [];
  let added = 0;
  let linked = 0;
  const seen = new Set<string>();
  for (const r of parsed.rows) {
    const key = nameKey(r.values.name);
    let id = idByKey.get(key);
    if (!id) {
      id = newId();
      idByKey.set(key, id);
      added++;
      statements.push({ text: 'INSERT INTO adviser (id, event_id, name, name_key, email) VALUES ($1, $2, $3, $4, $5)', params: [id, event.id, r.values.name, key, r.values.email] });
    } else if (!seen.has(key) && r.values.email) {
      statements.push({ text: 'UPDATE adviser SET email = $2, name = $3 WHERE id = $1', params: [id, r.values.email, r.values.name] });
    }
    seen.add(key);
    const code = r.values.group_code.toUpperCase();
    const gkey = nameKey(r.values.group_name);
    if (code || gkey) {
      const g = groups.find((x) => (code && x.code === code) || (gkey && x.name_key === gkey));
      if (g) {
        statements.push({ text: 'UPDATE tgroup SET adviser_id = $2 WHERE id = $1', params: [g.id, id] });
        linked++;
      } else problems.push(`Row ${r.rowNumber}: no group ${code || r.values.group_name} in this event.`);
    }
  }
  statements.push({
    text: 'INSERT INTO roll_import (id, event_id, kind, file_name, row_count, added, updated) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    params: [newId(), event.id, 'advisers', name, parsed.rows.length, added, seen.size - added],
  });
  await transaction(statements);
  await log(event.id, acc.id, 'advisers.import', { file: name, added, linked });
  const msg = `Read ${seen.size} adviser${seen.size === 1 ? '' : 's'} from ${name}: ${added} new. ${linked} group${linked === 1 ? '' : 's'} given an adviser.`;
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

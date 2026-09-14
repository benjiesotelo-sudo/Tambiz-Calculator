'use server';

// Saves from the coordinator's spreadsheet tables. Each action checks the caller itself, applies the same rules as the
// forms, and returns only the rows it changed, so a page never reloads everything to change one cell.

import { requireAdmin } from '@/lib/auth';
import { logStatement } from '@/lib/change-log';
import { newId, one, query, transaction, type Statement } from '@/lib/db';
import { changesByRow, isNewRow, type CellChange, type GridResult, type SavedRow } from '@/lib/grid';
import { editGroup, nextGroupCode, removeGroup } from '@/lib/group-edit';
import { emailGivesAway, normaliseCheck } from '@/lib/link-rules';
import { generatePassword, hashPassword } from '@/lib/passwords';
import { eventReport, getEvent, getGroup, groupMembers, groupScoreDetail, type StudentRow } from '@/lib/repo';
import type { Half } from '@/lib/rubric';
import { applyCorrection } from '@/lib/score-correct';
import { nameKey } from '@/lib/seed';
import { fmtScore } from '@/lib/sheet';
import { adviserGridRow, gradeGridRow, groupGridRow, judgeGridRow, memberGridRow, rollGridRow, scoreGridRow, type AdviserListRow } from '@/lib/tables';

const GONE: GridResult = { rows: [], notice: 'This event or group no longer exists. Reload the page.' };
const isUnique = (e: unknown) => (e as { code?: string })?.code === '23505';

// ── groups ────────────────────────────────────────────────────

export async function saveGroupsTable(eventId: string, changes: CellChange[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const rows: SavedRow[] = [];
  const notices: string[] = [];
  for (const [rowId, patch] of changesByRow(changes)) {
    const before = isNewRow(rowId) ? null : await getGroup(event.id, rowId);
    if (!isNewRow(rowId) && !before) {
      rows.push({ rowId, error: 'This group was deleted. Reload the page.' });
      continue;
    }
    const res = await editGroup(event, acc.id, before, {
      // A new group typed without a code gets the next free one.
      code: before ? (patch.code ?? before.code) : patch.code || (await nextGroupCode(event.id)),
      name: patch.name ?? before?.name ?? '',
      section: patch.section ?? before?.section ?? '',
      adviser: 'adviser' in patch ? patch.adviser : (before?.adviser_id ?? ''),
    });
    if (!res.ok) {
      rows.push(res.field ? { rowId, errors: { [res.field]: res.error } } : { rowId, error: res.error });
      continue;
    }
    rows.push({ rowId, row: groupGridRow(event, res.group) });
    if (event.released_at && res.changes.length) notices.push(res.message);
  }
  return { rows, notice: notices.join(' ') || undefined };
}

export async function removeGroupsTable(eventId: string, ids: string[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const rows: SavedRow[] = [];
  for (const id of ids) {
    const refused = await removeGroup(event, acc.id, id);
    rows.push(refused ? { rowId: id, error: refused } : { rowId: id, removed: true });
  }
  const refused = rows.find((r) => r.error)?.error;
  return { rows, notice: refused ?? 'Group deleted.' };
}

// ── members of a group ────────────────────────────────────────

const memberRow = (groupId: string, studentId: string) =>
  one<StudentRow>('SELECT s.*, m.absent_at FROM group_member m JOIN student s ON s.id = m.student_id WHERE m.group_id = $1 AND m.student_id = $2', [groupId, studentId]);

export async function saveMembersTable(eventId: string, groupId: string, changes: CellChange[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  const group = event ? await getGroup(event.id, groupId) : null;
  if (!event || !group) return GONE;
  const released = !!event.released_at;
  const rows: SavedRow[] = [];
  for (const [rowId, patch] of changesByRow(changes)) {
    let studentId = rowId;
    if (isNewRow(rowId)) {
      if (released) {
        rows.push({ rowId, error: 'Results have been released, so no member can be added.' });
        continue;
      }
      const typed = (patch.student ?? '').trim();
      const st = await one<StudentRow & { in_group: string | null; in_code: string | null }>(
        `SELECT s.*, g.id AS in_group, g.code AS in_code FROM student s LEFT JOIN group_member m ON m.student_id = s.id LEFT JOIN tgroup g ON g.id = m.group_id
         WHERE s.event_id = $1 AND (s.id = $2 OR s.student_number = $3)`,
        [event.id, typed, typed.replace(/\s+/g, '')],
      );
      if (!st) {
        rows.push({ rowId, errors: { student: `No student ${typed} on the class roll. Members are chosen from the roll, never typed in.` } });
        continue;
      }
      if (st.in_group) {
        const where = st.in_group === group.id ? 'this group already' : `${st.in_code} already. A student can belong to only one group: change their group on the Class roll to move them`;
        rows.push({ rowId, errors: { student: `${st.first_name} ${st.surname} is in ${where}.` } });
        continue;
      }
      try {
        await transaction([
          { text: 'INSERT INTO group_member (event_id, group_id, student_id) VALUES ($1, $2, $3)', params: [event.id, group.id, st.id] },
          // A student placed in a group is no longer left out.
          { text: 'UPDATE student SET excluded_reason = NULL, excluded_at = NULL WHERE id = $1', params: [st.id] },
          logStatement(event.id, acc.id, 'member.add', { groupId: group.id, students: [st.id] }),
        ]);
      } catch (e) {
        if (!isUnique(e)) throw e;
        rows.push({ rowId, errors: { student: `${st.first_name} ${st.surname} was just placed in another group.` } });
        continue;
      }
      studentId = st.id;
    }
    if ('absent' in patch && (patch.absent || !isNewRow(rowId))) {
      if (released) {
        rows.push({ rowId, errors: { absent: 'Results have been released; nothing can change now.' } });
        continue;
      }
      const absent = patch.absent === 'absent';
      await transaction([
        {
          text: `UPDATE group_member SET absent_at = CASE WHEN $3::boolean THEN coalesce(absent_at, now()) ELSE NULL END, absent_by = CASE WHEN $3::boolean THEN $4 ELSE NULL END
                 WHERE group_id = $1 AND student_id = $2`,
          params: [group.id, studentId, absent, acc.id],
        },
        logStatement(event.id, acc.id, absent ? 'member.absent' : 'member.present', { groupId: group.id, studentId }),
      ]);
    }
    const m = await memberRow(group.id, studentId);
    rows.push(m ? { rowId, row: memberGridRow(event, m) } : { rowId, error: 'This student is no longer in the group. Reload the page.' });
  }
  return { rows };
}

// ── class roll ────────────────────────────────────────────────
// A paste can touch every student at once, so the whole save is checked against data loaded once and written in one
// transaction, rather than a round trip per row.

type RollStudent = StudentRow & { group_id: string | null; group_code: string | null };
const ROLL_SELECT = `SELECT s.*, g.id AS group_id, g.code AS group_code, g.name AS group_name FROM student s
  LEFT JOIN group_member m ON m.student_id = s.id LEFT JOIN tgroup g ON g.id = m.group_id`;
const ROLL_REQUIRED = { student: 'Student No.', surname: 'Surname', first: 'First name', section: 'Section', email: 'Email' } as const;
const ROLL_FIELDS = [
  ['surname', 'surname'],
  ['first', 'first_name'],
  ['middle', 'middle_name'],
  ['section', 'section'],
  ['email', 'email'],
] as const;
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+$/.test(v);

export async function saveRollTable(eventId: string, changes: CellChange[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const released = !!event.released_at;
  const byRow = changesByRow(changes);
  const ids = [...byRow.keys()].filter((id) => !isNewRow(id));
  const numbers = [...byRow.entries()].filter(([id]) => isNewRow(id)).map(([, p]) => (p.student ?? '').replace(/\s+/g, ''));
  const [groups, current, taken] = await Promise.all([
    query<{ id: string; code: string }>('SELECT id, code FROM tgroup WHERE event_id = $1', [event.id]),
    query<RollStudent>(`${ROLL_SELECT} WHERE s.event_id = $1 AND s.id = ANY($2::text[])`, [event.id, ids]),
    query<{ student_number: string; surname: string; first_name: string }>('SELECT student_number, surname, first_name FROM student WHERE event_id = $1 AND student_number = ANY($2::text[])', [
      event.id,
      numbers,
    ]),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupByCode = new Map(groups.map((g) => [g.code.toUpperCase(), g]));
  const studentById = new Map(current.map((s) => [s.id, s]));
  const takenNumbers = new Map(taken.map((t) => [t.student_number, `${t.surname}, ${t.first_name}`]));

  const statements: Statement[] = [];
  const rows: SavedRow[] = [];
  const touched: { rowId: string; id: string; errors: Record<string, string> }[] = [];
  let moved = 0;
  for (const [rowId, patch] of byRow) {
    const before = isNewRow(rowId) ? null : studentById.get(rowId);
    if (!isNewRow(rowId) && !before) {
      rows.push({ rowId, error: 'This student is no longer on the roll. Reload the page.' });
      continue;
    }
    const errors: Record<string, string> = {};
    const next: Record<keyof typeof ROLL_REQUIRED | 'middle', string> = {
      student: (patch.student ?? before?.student_number ?? '').replace(/\s+/g, ''),
      surname: (patch.surname ?? before?.surname ?? '').trim(),
      first: (patch.first ?? before?.first_name ?? '').trim(),
      middle: (patch.middle ?? before?.middle_name ?? '').trim(),
      section: (patch.section ?? before?.section ?? '').trim().toUpperCase(),
      email: (patch.email ?? before?.email ?? '').trim(),
    };
    for (const [key, label] of Object.entries(ROLL_REQUIRED)) if (!next[key as keyof typeof ROLL_REQUIRED]) errors[key] = `${label} cannot be empty.`;
    if (next.email && !looksLikeEmail(next.email)) errors.email = `“${next.email}” is not an email address.`;
    if (!before && next.student && takenNumbers.has(next.student)) errors.student = `Student No. ${next.student} is already on the roll (${takenNumbers.get(next.student)}).`;

    let groupId = before?.group_id ?? null;
    let groupChange: { from: string | null; to: string | null } | null = null;
    if ('group' in patch) {
      const typed = patch.group.trim();
      const g = typed ? (groupById.get(typed) ?? groupByCode.get(typed.toUpperCase())) : null;
      if (typed && !g) errors.group = `There is no group ${typed}.`;
      else if ((g?.id ?? null) !== groupId) {
        if (released) errors.group = 'Results have been released, so a student cannot change group now.';
        else {
          groupChange = { from: groupId, to: g?.id ?? null };
          groupId = g?.id ?? null;
        }
      }
    }
    let excluded: string | null = before?.excluded_reason ?? null;
    let excludeChange = false;
    if ('leftout' in patch) {
      const reason = patch.leftout.replace(/\s+/g, ' ').trim().slice(0, 200) || null;
      if (reason !== (groupId ? null : excluded)) {
        if (released) errors.leftout = 'Results have been released; nothing can change now.';
        else if (reason && groupId) errors.leftout = 'This student is in a group. Clear their Group first, then give the reason.';
        else if (reason && reason.length < 3) errors.leftout = 'Type a short reason, for example “Dropped the course”.';
        else {
          excluded = reason;
          excludeChange = true;
        }
      }
    }

    const id = before?.id ?? newId();
    if (!before) {
      if (Object.keys(errors).length) {
        rows.push({ rowId, errors });
        continue;
      }
      statements.push(
        {
          text: 'INSERT INTO student (id, event_id, student_number, email, surname, first_name, middle_name, section) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          params: [id, event.id, next.student, next.email, next.surname, next.first, next.middle, next.section],
        },
        logStatement(event.id, acc.id, 'roll.add', { studentId: id, studentNumber: next.student }),
      );
      takenNumbers.set(next.student, `${next.surname}, ${next.first}`);
    } else {
      const set = ROLL_FIELDS.filter(([key, col]) => key in patch && !errors[key] && next[key] !== before[col]);
      if (set.length) {
        statements.push(
          { text: `UPDATE student SET ${set.map(([, col], i) => `${col} = $${i + 2}`).join(', ')} WHERE id = $1`, params: [id, ...set.map(([key]) => next[key])] },
          logStatement(event.id, acc.id, 'roll.edit', { studentId: id, changes: set.map(([key, col]) => `${col}: ${before[col]} → ${next[key]}`) }),
        );
      }
    }
    if (groupChange) {
      statements.push({ text: 'DELETE FROM group_member WHERE event_id = $1 AND student_id = $2', params: [event.id, id] });
      if (groupChange.to) {
        statements.push(
          { text: 'INSERT INTO group_member (event_id, group_id, student_id) VALUES ($1, $2, $3)', params: [event.id, groupChange.to, id] },
          // A student placed in a group is no longer left out.
          { text: 'UPDATE student SET excluded_reason = NULL, excluded_at = NULL WHERE id = $1', params: [id] },
        );
      }
      const action = groupChange.to ? (groupChange.from ? 'member.move' : 'member.add') : 'member.remove';
      statements.push(logStatement(event.id, acc.id, action, { studentId: id, groupId: groupChange.to ?? groupChange.from, from: groupChange.from }));
      if (groupChange.from) moved++;
    }
    if (excludeChange) {
      statements.push(
        { text: 'UPDATE student SET excluded_reason = $2::text, excluded_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE id = $1', params: [id, excluded] },
        logStatement(event.id, acc.id, excluded ? 'student.exclude' : 'student.include', { studentId: id, reason: excluded }),
      );
    }
    touched.push({ rowId, id, errors });
  }

  try {
    await transaction(statements);
  } catch (e) {
    if (!isUnique(e)) throw e;
    const error = 'Not saved: someone changed the roll at the same moment (a student number or a place in a group was taken). Reload the page and try again.';
    return { rows: [...rows, ...touched.map((t) => ({ rowId: t.rowId, error }))] };
  }
  const fresh = new Map((await query<RollStudent>(`${ROLL_SELECT} WHERE s.id = ANY($1::text[])`, [touched.map((t) => t.id)])).map((s) => [s.id, s]));
  for (const t of touched) {
    const s = fresh.get(t.id);
    rows.push(s ? { rowId: t.rowId, row: rollGridRow(event, s), errors: Object.keys(t.errors).length ? t.errors : undefined } : { rowId: t.rowId, error: 'Not found after saving. Reload the page.' });
  }
  return {
    rows,
    notice: moved ? `Moved ${moved} student${moved === 1 ? '' : 's'} out of another group. Their scores from the old group no longer count.` : undefined,
  };
}

// ── advisers ──────────────────────────────────────────────────

const ADVISER_SELECT = 'SELECT a.*, (SELECT count(*)::int FROM tgroup g WHERE g.adviser_id = a.id) AS group_count FROM adviser a';
/** An adviser code as stored: capitals, spaces removed. Checking ignores dashes and case anyway. */
const cleanCode = (v: string) => v.toUpperCase().replace(/\s+/g, '').slice(0, 20);

export async function saveAdvisersTable(eventId: string, changes: CellChange[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const all = await query<AdviserListRow>(`${ADVISER_SELECT} WHERE a.event_id = $1`, [event.id]);
  const rows: SavedRow[] = [];
  const notices: string[] = [];
  for (const [rowId, patch] of changesByRow(changes)) {
    const before = isNewRow(rowId) ? null : all.find((a) => a.id === rowId);
    if (!isNewRow(rowId) && !before) {
      rows.push({ rowId, error: 'This adviser was removed. Reload the page.' });
      continue;
    }
    const errors: Record<string, string> = {};
    const name = (patch.name ?? before?.name ?? '').replace(/\s+/g, ' ').trim();
    const email = (patch.email ?? before?.email ?? '').trim();
    const code = cleanCode(patch.code ?? before?.link_code ?? '');
    const key = nameKey(name);
    const twin = all.find((a) => a.id !== before?.id && a.name_key === key);
    if (!key) errors.name = 'An adviser needs a name.';
    else if (twin) errors.name = `${twin.name} is already on the list (spacing and punctuation are ignored).`;
    if (email && !looksLikeEmail(email)) errors.email = `“${email}” is not an email address.`;
    if (code && normaliseCheck(code).length < 4) errors.code = 'Use at least four letters or numbers, for example K7Q-4MP.';
    else if (code && all.some((a) => a.id !== before?.id && a.link_code && normaliseCheck(a.link_code) === normaliseCheck(code))) errors.code = 'Another adviser already has that code.';
    else if (code && email && emailGivesAway(email, code)) errors['code' in patch ? 'code' : 'email'] = 'The email contains the adviser code, so the code would not protect the link. Choose another code.';

    if (!before) {
      if (Object.keys(errors).length) {
        rows.push({ rowId, errors });
        continue;
      }
      const id = newId();
      try {
        await transaction([
          { text: 'INSERT INTO adviser (id, event_id, name, name_key, email, link_code) VALUES ($1, $2, $3, $4, $5, $6)', params: [id, event.id, name, key, email, code] },
          logStatement(event.id, acc.id, 'adviser.add', { adviserId: id, name }),
        ]);
      } catch (e) {
        if (!isUnique(e)) throw e;
        rows.push({ rowId, errors: { name: `${name} was just added by someone else. Reload the page.` } });
        continue;
      }
      const added = { id, name, name_key: key, email, link_code: code, group_count: 0 };
      all.push(added);
      rows.push({ rowId, row: adviserGridRow(added) });
      continue;
    }
    const final = { name: errors.name ? before.name : name, email: errors.email ? before.email : email, link_code: errors.code ? before.link_code : code };
    const changed = (['name', 'email', 'link_code'] as const).filter((k) => final[k] !== before[k]);
    if (changed.length) {
      await transaction([
        { text: 'UPDATE adviser SET name = $2, name_key = $3, email = $4, link_code = $5 WHERE id = $1', params: [before.id, final.name, nameKey(final.name), final.email, final.link_code] },
        // The code itself is not written to the history: it is what opens the adviser's results.
        logStatement(event.id, acc.id, 'adviser.edit', { adviserId: before.id, changes: changed.map((k) => (k === 'link_code' ? 'Adviser code changed' : `${k}: ${before[k]} → ${final[k]}`)) }),
      ]);
      Object.assign(before, final, { name_key: nameKey(final.name) });
      if (event.released_at && changed.includes('link_code')) notices.push(`Results were already released, so ${final.name} now opens their link with the new code. Give them the new code.`);
      if (event.released_at && changed.includes('email')) notices.push(`Results were already released: the mailing sheet already sent still has ${final.name}’s old email.`);
    }
    rows.push({ rowId, row: adviserGridRow(before), errors: Object.keys(errors).length ? errors : undefined });
  }
  return { rows, notice: notices.join(' ') || undefined };
}

export async function removeAdvisersTable(eventId: string, ids: string[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const all = await query<AdviserListRow>(`${ADVISER_SELECT} WHERE a.event_id = $1 AND a.id = ANY($2::text[])`, [event.id, ids]);
  const rows: SavedRow[] = [];
  for (const id of ids) {
    const a = all.find((x) => x.id === id);
    if (!a) rows.push({ rowId: id, removed: true });
    else if (event.released_at) rows.push({ rowId: id, error: 'Results have been released, so an adviser cannot be removed.' });
    else if (a.group_count) rows.push({ rowId: id, error: `${a.name} advises ${a.group_count} group${a.group_count === 1 ? '' : 's'}. Give ${a.group_count === 1 ? 'it' : 'them'} another adviser on the Groups table first.` });
    else {
      await transaction([{ text: 'DELETE FROM adviser WHERE id = $1 AND event_id = $2', params: [id, event.id] }, logStatement(event.id, acc.id, 'adviser.remove', { adviserId: id, name: a.name })]);
      rows.push({ rowId: id, removed: true });
    }
  }
  return { rows, notice: rows.find((r) => r.error)?.error ?? 'Adviser removed.' };
}

// ── judges ────────────────────────────────────────────────────

export async function saveJudgesTable(eventId: string, changes: CellChange[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const rows: SavedRow[] = [];
  const secrets: string[] = [];
  const notices: string[] = [];
  for (const [rowId, patch] of changesByRow(changes)) {
    const errors: Record<string, string> = {};
    if (isNewRow(rowId)) {
      const name = (patch.name ?? '').replace(/\s+/g, ' ').trim();
      const login = (patch.login ?? '').trim().toLowerCase();
      if (!name) errors.name = 'Type the name judges see, for example Dr. Liza Manalo.';
      if (!login) errors.login = 'Type an email or a short login.';
      if (Object.keys(errors).length) {
        rows.push({ rowId, errors });
        continue;
      }
      const existing = await one<{ id: string; role: string; display_name: string; email: string; judging: boolean }>(
        'SELECT id, role, display_name, email, EXISTS (SELECT 1 FROM event_judge j WHERE j.account_id = a.id AND j.event_id = $2) AS judging FROM account a WHERE lower(email) = $1',
        [login, event.id],
      );
      if (existing?.role === 'admin') {
        rows.push({ rowId, errors: { login: 'That login belongs to a coordinator account.' } });
        continue;
      }
      if (existing?.judging) {
        rows.push({ rowId, errors: { login: `${existing.display_name} is already a judge for this event.` } });
        continue;
      }
      if (existing) {
        // A judge from an earlier year keeps their account, so their record in Judge profiles stays together.
        await transaction([
          { text: 'INSERT INTO event_judge (event_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', params: [event.id, existing.id] },
          { text: 'UPDATE account SET disabled_at = NULL WHERE id = $1', params: [existing.id] },
          logStatement(event.id, acc.id, 'judge.add', { id: existing.id }),
        ]);
        notices.push(`${existing.email} already had an account, as ${existing.display_name}, and is now a judge for ${event.title}. Their password is unchanged; use Reset password if they have forgotten it.`);
        rows.push({ rowId, row: judgeGridRow(event.id, existing) });
        continue;
      }
      const password = generatePassword();
      const id = newId();
      await transaction([
        { text: `INSERT INTO account (id, email, display_name, role, password_hash) VALUES ($1, $2, $3, 'judge', $4)`, params: [id, login, name, await hashPassword(password)] },
        { text: 'INSERT INTO event_judge (event_id, account_id) VALUES ($1, $2)', params: [event.id, id] },
        logStatement(event.id, acc.id, 'judge.create', { id, email: login }),
      ]);
      secrets.push(`${name} signs in with ${login} and password ${password}`);
      rows.push({ rowId, row: judgeGridRow(event.id, { id, email: login, display_name: name }) });
      continue;
    }
    const before = await one<{ id: string; email: string; display_name: string }>(
      `SELECT a.id, a.email, a.display_name FROM account a JOIN event_judge j ON j.account_id = a.id AND j.event_id = $2 WHERE a.id = $1 AND a.role = 'judge'`,
      [rowId, event.id],
    );
    if (!before) {
      rows.push({ rowId, error: 'This judge is no longer on this event. Reload the page.' });
      continue;
    }
    const name = (patch.name ?? before.display_name).replace(/\s+/g, ' ').trim();
    const login = (patch.login ?? before.email).trim().toLowerCase();
    if (!name) errors.name = 'A judge needs a name.';
    if (!login) errors.login = 'A judge needs an email or login.';
    else if (login !== before.email.toLowerCase()) {
      const clash = await one<{ display_name: string }>('SELECT display_name FROM account WHERE lower(email) = $1 AND id <> $2', [login, before.id]);
      if (clash) errors.login = `${login} is already the login of ${clash.display_name}.`;
    }
    const final = { display_name: errors.name ? before.display_name : name, email: errors.login ? before.email : login };
    if (final.display_name !== before.display_name || final.email !== before.email) {
      await transaction([
        { text: 'UPDATE account SET display_name = $2, email = $3 WHERE id = $1', params: [before.id, final.display_name, final.email] },
        logStatement(event.id, acc.id, 'judge.edit', { id: before.id, from: { name: before.display_name, email: before.email }, to: { name: final.display_name, email: final.email } }),
      ]);
      if (final.email !== before.email) notices.push(`${final.display_name} now signs in with ${final.email}. Their password is unchanged.`);
    }
    rows.push({ rowId, row: judgeGridRow(event.id, { id: before.id, ...final }), errors: Object.keys(errors).length ? errors : undefined });
  }
  return { rows, secret: secrets.join(' · ') || undefined, notice: notices.join(' ') || undefined };
}

export async function removeJudgesTable(eventId: string, ids: string[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  await transaction(
    ids.flatMap((id) => [
      { text: 'DELETE FROM event_judge WHERE event_id = $1 AND account_id = $2', params: [event.id, id] },
      logStatement(event.id, acc.id, 'judge.remove', { accountId: id }),
    ]),
  );
  return { rows: ids.map((rowId) => ({ rowId, removed: true })), notice: 'Removed from this event. Sheets they already submitted still count; they can no longer score.', refresh: true };
}

export async function resetJudgeTable(eventId: string, accountId: string): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const judge = await one<{ id: string; email: string; display_name: string }>(
    `SELECT a.id, a.email, a.display_name FROM account a JOIN event_judge j ON j.account_id = a.id AND j.event_id = $2 WHERE a.id = $1 AND a.role = 'judge'`,
    [accountId, event.id],
  );
  if (!judge) return { rows: [{ rowId: accountId, error: 'Judge not found on this event.' }] };
  const password = generatePassword();
  await transaction([
    { text: 'UPDATE account SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1', params: [judge.id, await hashPassword(password)] },
    { text: 'DELETE FROM session WHERE account_id = $1', params: [judge.id] },
    logStatement(event.id, acc.id, 'judge.reset', { id: judge.id }),
  ]);
  return { rows: [], secret: `${judge.display_name} signs in with ${judge.email} and password ${password}`, notice: 'Password reset. The judge is signed out everywhere.' };
}

/** Picks a judge from the department's standing list for this event; their record in Judge profiles carries on. */
export async function addDepartmentJudgeTable(eventId: string, accountId: string): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const judge = await one<{ id: string; display_name: string }>(`SELECT id, display_name FROM account WHERE id = $1 AND role = 'judge'`, [accountId]);
  if (!judge) return { rows: [{ rowId: accountId, error: 'Judge not found.' }] };
  await transaction([
    { text: 'INSERT INTO event_judge (event_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', params: [event.id, judge.id] },
    { text: 'UPDATE account SET disabled_at = NULL WHERE id = $1', params: [judge.id] },
    logStatement(event.id, acc.id, 'judge.add', { id: judge.id }),
  ]);
  return {
    rows: [{ rowId: judge.id, removed: true }],
    notice: `${judge.display_name} is now a judge for ${event.title}. Their password is unchanged; use Reset password if they have forgotten it.`,
    refresh: true,
  };
}

// ── a group's scores (corrections, decision 7) ────────────────

export async function saveScoresTable(eventId: string, groupId: string, half: Half, changes: CellChange[], reason: string): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  const group = event ? await getGroup(event.id, groupId) : null;
  if (!event || !group || (half !== 'defense' && half !== 'booth')) return GONE;
  const errors = new Map<string, Record<string, string>>();
  const done: string[] = [];
  const show = (v: number | null) => (v === null ? 'blank' : fmtScore(v));
  // Each change is one box: the row is the box (c:… or m:…), the column is the judge's sheet.
  for (const ch of changes) {
    const res = await applyCorrection(event, acc.id, ch.key, ch.rowId, ch.value, reason);
    const wrongPlace = res.group !== undefined && (res.group !== group.id || res.half !== half);
    if (!res.ok || wrongPlace) errors.set(ch.rowId, { ...(errors.get(ch.rowId) ?? {}), [ch.key]: wrongPlace ? 'That score belongs to another group.' : res.ok ? '' : res.error });
    else done.push(`${res.label} for ${res.judge}: ${show(res.from)} → ${show(res.to)}`);
  }
  const [detail, members] = await Promise.all([groupScoreDetail(event, group.id, half), half === 'defense' ? groupMembers(group.id) : Promise.resolve([])]);
  const rows: SavedRow[] = [...new Set(changes.map((c) => c.rowId))].map((key) => {
    const row = scoreGridRow(event, half, detail, members, key);
    return row ? { rowId: key, row, errors: errors.get(key) } : { rowId: key, error: 'Unknown score box.' };
  });
  return { rows, notice: done.length ? `Corrected ${done.length === 1 ? done[0] : `${done.length} scores`}. The judge’s own score is kept and your reason is recorded.` : undefined };
}

// ── grades ────────────────────────────────────────────────────

export async function saveGradesTable(eventId: string, changes: CellChange[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const rows: SavedRow[] = [];
  const statements: Statement[] = [];
  const touched: string[] = [];
  for (const [rowId, patch] of changesByRow(changes)) {
    if (!('absent' in patch)) continue;
    if (event.released_at) {
      rows.push({ rowId, errors: { absent: 'Results have been released; nothing can change now.' } });
      continue;
    }
    const absent = patch.absent === 'absent';
    statements.push(
      {
        text: `UPDATE group_member SET absent_at = CASE WHEN $3::boolean THEN coalesce(absent_at, now()) ELSE NULL END, absent_by = CASE WHEN $3::boolean THEN $4 ELSE NULL END
               WHERE event_id = $1 AND student_id = $2`,
        params: [event.id, rowId, absent, acc.id],
      },
      logStatement(event.id, acc.id, absent ? 'member.absent' : 'member.present', { studentId: rowId }),
    );
    touched.push(rowId);
  }
  if (!touched.length) return { rows };
  await transaction(statements);
  // A grade depends on the whole group's results, so it is worked out again on the server; only these rows go back.
  const report = await eventReport(event);
  const byStudent = new Map(report.grades.map((g) => [g.student.id, g]));
  for (const id of touched) {
    const g = byStudent.get(id);
    rows.push(g ? { rowId: id, row: gradeGridRow(event, g) } : { rowId: id, error: 'This student is no longer in a group. Reload the page.' });
  }
  return { rows };
}

export async function removeMembersTable(eventId: string, groupId: string, ids: string[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  if (event.released_at) return { rows: ids.map((rowId) => ({ rowId, error: 'Results have been released; nothing can change now.' })), notice: 'Results have been released, so members cannot be removed.' };
  await transaction(
    ids.flatMap((id) => [
      { text: 'DELETE FROM group_member WHERE event_id = $1 AND group_id = $2 AND student_id = $3', params: [event.id, groupId, id] },
      logStatement(event.id, acc.id, 'member.remove', { groupId, studentId: id }),
    ]),
  );
  return { rows: ids.map((rowId) => ({ rowId, removed: true })), notice: 'Removed from the group. Their scores from this group no longer count.' };
}

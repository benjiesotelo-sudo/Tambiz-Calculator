'use server';

// Saves from the coordinator's spreadsheet tables. Each action checks the caller itself, applies the same rules as the
// workbook upload, and returns only the rows it changed, so a page never reloads everything to change one cell.

import { requireAdmin } from '@/lib/auth';
import { logStatement } from '@/lib/change-log';
import { looksLikeEmail } from '@/lib/data-workbook';
import { newId, one, query, transaction, type Statement } from '@/lib/db';
import { changesByRow, isNewRow, type CellChange, type GridResult, type SavedRow } from '@/lib/grid';
import { LOCKED_CLOSED, LOCKED_SENT, rosterLock } from '@/lib/locks';
import { generatePassword, hashPassword } from '@/lib/passwords';
import { DATA_SELECT, eventReport, getEvent, getGroup, groupMembers, groupScoreDetail, type DataRow } from '@/lib/repo';
import type { Half } from '@/lib/rubric';
import { applyCorrection } from '@/lib/score-correct';
import { nameKey } from '@/lib/seed';
import { fmtScore } from '@/lib/sheet';
import { dataGridRow, gradeGridRow, judgeGridRow, scoreGridRow } from '@/lib/tables';

const GONE: GridResult = { rows: [], notice: 'This event or group no longer exists. Reload the page.' };
const isUnique = (e: unknown) => (e as { code?: string })?.code === '23505';

/** Deletes groups left with no members, never one with a score sheet (that would delete the sheet). */
const tidyEmptyGroups = (eventId: string, groupIds: string[]): Statement => ({
  text: `DELETE FROM tgroup g WHERE g.event_id = $1 AND g.id = ANY($2::text[])
         AND NOT EXISTS (SELECT 1 FROM group_member m WHERE m.group_id = g.id) AND NOT EXISTS (SELECT 1 FROM score_sheet s WHERE s.group_id = g.id)`,
  params: [eventId, groupIds],
});

// ── the Data table: every student with their group and its adviser ──
// A paste can touch every student at once, so the whole save is checked against data loaded once and written in one
// transaction. A group has one adviser, so a student's Adviser or Adviser email is the group's: changing it on one row
// changes it for every member, and those rows come back too.

const REQUIRED = { student: 'Student No.', surname: 'Surname', first: 'First name', email: 'Email' } as const;
const FIELDS = [
  ['surname', 'surname'],
  ['first', 'first_name'],
  ['middle', 'middle_name'],
  ['section', 'section'],
  ['email', 'email'],
] as const;

export async function saveDataTable(eventId: string, changes: CellChange[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const byRow = changesByRow(changes);
  if (event.released_at) return { rows: [...byRow.keys()].map((rowId) => ({ rowId, error: LOCKED_SENT })) };
  const closed = event.status === 'finalised';
  const ids = [...byRow.keys()].filter((id) => !isNewRow(id));
  const numbers = [...byRow.entries()].filter(([id]) => isNewRow(id)).map(([, p]) => (p.student ?? '').replace(/\s+/g, ''));
  const [groups, advisers, current, taken] = await Promise.all([
    query<{ id: string; name: string; name_key: string; adviser_id: string | null }>('SELECT id, name, name_key, adviser_id FROM tgroup WHERE event_id = $1', [event.id]),
    query<{ id: string; name: string; name_key: string; email: string }>('SELECT id, name, name_key, email FROM adviser WHERE event_id = $1', [event.id]),
    query<DataRow>(`${DATA_SELECT} WHERE s.event_id = $1 AND s.id = ANY($2::text[])`, [event.id, ids]),
    query<{ student_number: string; surname: string; first_name: string }>('SELECT student_number, surname, first_name FROM student WHERE event_id = $1 AND student_number = ANY($2::text[])', [
      event.id,
      numbers,
    ]),
  ]);
  const groupFor = (typed: string) => groups.find((g) => g.id === typed) ?? groups.find((g) => g.name_key === nameKey(typed));
  const adviserFor = (typed: string) => advisers.find((a) => a.id === typed) ?? advisers.find((a) => a.name_key === nameKey(typed));
  const adviserName = (id: string | null) => advisers.find((a) => a.id === id)?.name ?? 'no adviser';
  const studentById = new Map(current.map((s) => [s.id, s]));
  const takenNumbers = new Map(taken.map((t) => [t.student_number, `${t.surname}, ${t.first_name}`]));

  const statements: Statement[] = [];
  const rows: SavedRow[] = [];
  const touched: { rowId: string; id: string; errors: Record<string, string> }[] = [];
  const emptied = new Set<string>();
  const regrouped = new Set<string>();
  const readvised = new Set<string>();
  let created = false;
  let moved = 0;

  for (const [rowId, patch] of byRow) {
    const before = isNewRow(rowId) ? null : studentById.get(rowId);
    if (!isNewRow(rowId) && !before) {
      rows.push({ rowId, error: 'This student is no longer in the app. Reload the page.' });
      continue;
    }
    if (!before && closed) {
      rows.push({ rowId, error: LOCKED_CLOSED });
      continue;
    }
    const errors: Record<string, string> = {};
    const next: Record<keyof typeof REQUIRED | 'middle' | 'section', string> = {
      student: (patch.student ?? before?.student_number ?? '').replace(/\s+/g, ''),
      surname: (patch.surname ?? before?.surname ?? '').trim(),
      first: (patch.first ?? before?.first_name ?? '').trim(),
      middle: (patch.middle ?? before?.middle_name ?? '').trim(),
      section: (patch.section ?? before?.section ?? '').trim(),
      email: (patch.email ?? before?.email ?? '').trim(),
    };
    for (const [key, label] of Object.entries(REQUIRED)) if (!next[key as keyof typeof REQUIRED]) errors[key] = `${label} cannot be empty.`;
    if (next.email && !looksLikeEmail(next.email)) errors.email = `“${next.email}” is not an email address.`;
    if (!before && next.student && takenNumbers.has(next.student)) errors.student = `Student No. ${next.student} is already in the app (${takenNumbers.get(next.student)}).`;

    // The group: an existing one picked or typed (spacing, punctuation and capitals ignored), or a new one.
    let group = before?.group_id ? groups.find((g) => g.id === before.group_id) : undefined;
    let newGroup: { id: string; name: string; name_key: string; adviser_id: string | null } | null = null;
    if ('group' in patch || !before) {
      const typed = (patch.group ?? '').replace(/\s+/g, ' ').trim();
      const found = typed ? groupFor(typed) : undefined;
      if (closed && found?.id !== group?.id) errors.group = LOCKED_CLOSED;
      else if (!typed) errors.group = 'Every student needs a group.';
      else if (!nameKey(typed)) errors.group = 'A group name needs at least one letter or number.';
      else if (found) group = found;
      else newGroup = group = { id: newId(), name: typed, name_key: nameKey(typed), adviser_id: null };
    }

    // The adviser typed on this row, if any: an existing one, or a new one.
    let adviser: { id: string; name: string; name_key: string; email: string } | undefined;
    let newAdviser = false;
    if ('adviser' in patch || !before) {
      const typed = (patch.adviser ?? '').replace(/\s+/g, ' ').trim();
      if (closed && 'adviser' in patch) errors.adviser = LOCKED_CLOSED;
      else if (!typed) errors.adviser = 'Every group needs an adviser.';
      else if (!nameKey(typed)) errors.adviser = 'An adviser’s name needs at least one letter or number.';
      else {
        adviser = adviserFor(typed);
        if (!adviser) {
          adviser = { id: newId(), name: typed, name_key: nameKey(typed), email: '' };
          newAdviser = true;
        }
      }
    }
    if (newGroup && !adviser && !errors.adviser) {
      const inherited = before?.adviser_id ? advisers.find((a) => a.id === before.adviser_id) : undefined;
      if (inherited) adviser = inherited;
      else errors.adviser = `${newGroup.name} is a new group, so it needs an adviser. Type it in Adviser.`;
    }
    // A new student joining an existing group joins its adviser; naming a different one is refused, not applied.
    if (!before && group && !newGroup && adviser && group.adviser_id && group.adviser_id !== adviser.id) {
      errors.adviser = `${group.name}’s adviser is ${adviserName(group.adviser_id)}. To change it for the whole group, change Adviser on any of its rows.`;
    }

    let adviserEmail: string | null = null;
    if ('adviserEmail' in patch) {
      const typed = patch.adviserEmail.trim();
      if (typed && !looksLikeEmail(typed)) errors.adviserEmail = `“${typed}” is not an email address.`;
      else adviserEmail = typed;
    }

    if (!before && Object.keys(errors).length) {
      rows.push({ rowId, errors });
      continue;
    }
    const groupError = !!errors.group;
    const adviserError = !!errors.adviser;

    if (adviser && newAdviser && !adviserError && (newGroup || 'adviser' in patch || !before)) {
      statements.push({ text: 'INSERT INTO adviser (id, event_id, name, name_key, email) VALUES ($1, $2, $3, $4, $5)', params: [adviser.id, event.id, adviser.name, adviser.name_key, ''] });
      advisers.push(adviser);
      created = true;
    }
    if (newGroup && !groupError) {
      newGroup.adviser_id = adviser?.id ?? null;
      statements.push(
        { text: 'INSERT INTO tgroup (id, event_id, name, name_key, adviser_id) VALUES ($1, $2, $3, $4, $5)', params: [newGroup.id, event.id, newGroup.name, newGroup.name_key, newGroup.adviser_id] },
        logStatement(event.id, acc.id, 'group.create', { id: newGroup.id, name: newGroup.name }),
      );
      groups.push(newGroup);
      created = true;
    }

    const id = before?.id ?? newId();
    if (!before) {
      statements.push(
        {
          text: 'INSERT INTO student (id, event_id, student_number, email, surname, first_name, middle_name, section) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          params: [id, event.id, next.student, next.email, next.surname, next.first, next.middle, next.section],
        },
        { text: 'INSERT INTO group_member (event_id, group_id, student_id) VALUES ($1, $2, $3)', params: [event.id, group!.id, id] },
        logStatement(event.id, acc.id, 'roll.add', { studentId: id, studentNumber: next.student, groupId: group!.id }),
      );
      takenNumbers.set(next.student, `${next.surname}, ${next.first}`);
    } else {
      const set = FIELDS.filter(([key, col]) => key in patch && !errors[key] && next[key] !== before[col]);
      if (set.length) {
        statements.push(
          { text: `UPDATE student SET ${set.map(([, col], i) => `${col} = $${i + 2}`).join(', ')} WHERE id = $1`, params: [id, ...set.map(([key]) => next[key])] },
          logStatement(event.id, acc.id, 'roll.edit', { studentId: id, changes: set.map(([key, col]) => `${col}: ${before[col]} → ${next[key]}`) }),
        );
      }
      if (!groupError && group && group.id !== before.group_id) {
        statements.push(
          { text: 'DELETE FROM group_member WHERE event_id = $1 AND student_id = $2', params: [event.id, id] },
          { text: 'INSERT INTO group_member (event_id, group_id, student_id) VALUES ($1, $2, $3)', params: [event.id, group.id, id] },
          logStatement(event.id, acc.id, before.group_id ? 'member.move' : 'member.add', { studentId: id, groupId: group.id, from: before.group_id }),
        );
        if (before.group_id) {
          moved++;
          emptied.add(before.group_id);
        }
      }
    }

    // Changing the adviser on an existing student's row changes it for their whole group.
    if (before && !adviserError && adviser && group && !newGroup && 'adviser' in patch && group.adviser_id !== adviser.id) {
      statements.push(
        { text: 'UPDATE tgroup SET adviser_id = $2 WHERE id = $1', params: [group.id, adviser.id] },
        logStatement(event.id, acc.id, 'group.update', { groupId: group.id, from: { adviserId: group.adviser_id }, to: { adviserId: adviser.id } }),
      );
      group.adviser_id = adviser.id;
      regrouped.add(group.id);
    }
    if (adviserEmail !== null) {
      const target = advisers.find((a) => a.id === (groupError ? before?.adviser_id : group?.adviser_id));
      if (!target) errors.adviserEmail = 'This student’s group has no adviser yet, so there is no adviser to give an email.';
      else if (target.email !== adviserEmail) {
        statements.push(
          { text: 'UPDATE adviser SET email = $2 WHERE id = $1', params: [target.id, adviserEmail] },
          logStatement(event.id, acc.id, 'adviser.edit', { adviserId: target.id, from: { email: target.email }, to: { email: adviserEmail } }),
        );
        target.email = adviserEmail;
        readvised.add(target.id);
      }
    }
    touched.push({ rowId, id, errors });
  }

  if (emptied.size) statements.push(tidyEmptyGroups(event.id, [...emptied]));
  try {
    await transaction(statements);
  } catch (e) {
    if (!isUnique(e)) throw e;
    const error = 'Not saved: someone changed the same student or group at the same moment. Reload the page and try again.';
    return { rows: [...rows, ...touched.map((t) => ({ rowId: t.rowId, error }))] };
  }
  const fresh = await query<DataRow>(
    `${DATA_SELECT} WHERE s.event_id = $1 AND (s.id = ANY($2::text[]) OR g.id = ANY($3::text[]) OR a.id = ANY($4::text[]))`,
    [event.id, touched.map((t) => t.id), [...regrouped], [...readvised]],
  );
  const byId = new Map(fresh.map((s) => [s.id, s]));
  for (const t of touched) {
    const s = byId.get(t.id);
    rows.push(s ? { rowId: t.rowId, row: dataGridRow(event, s), errors: Object.keys(t.errors).length ? t.errors : undefined } : { rowId: t.rowId, error: 'Not found after saving. Reload the page.' });
  }
  const mine = new Set(touched.map((t) => t.id));
  for (const s of fresh) if (!mine.has(s.id)) rows.push({ rowId: s.id, row: dataGridRow(event, s) });
  return {
    rows,
    notice: moved ? `Moved ${moved} student${moved === 1 ? '' : 's'} to another group. Individual scores from the old group stay stored but no longer count.` : undefined,
    // A new group or adviser joins the choices offered while typing.
    refresh: created || undefined,
  };
}

/** Removes students on purpose. A student with individual scores cannot be removed, because that would delete the scores. */
export async function removeStudentsTable(eventId: string, ids: string[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const locked = rosterLock(event);
  if (locked) return { rows: ids.map((rowId) => ({ rowId, error: locked })), notice: locked };
  const found = await query<{ id: string; surname: string; first_name: string; group_id: string | null; scores: number }>(
    `SELECT s.id, s.surname, s.first_name, m.group_id, (SELECT count(*)::int FROM member_score x WHERE x.student_id = s.id) AS scores
     FROM student s LEFT JOIN group_member m ON m.student_id = s.id WHERE s.event_id = $1 AND s.id = ANY($2::text[])`,
    [event.id, ids],
  );
  const rows: SavedRow[] = [];
  const statements: Statement[] = [];
  const groups: string[] = [];
  for (const id of ids) {
    const st = found.find((f) => f.id === id);
    if (!st) rows.push({ rowId: id, removed: true });
    else if (st.scores) rows.push({ rowId: id, error: `${st.first_name} ${st.surname} has individual scores from the judges, so cannot be removed: removing would delete those scores.` });
    else {
      statements.push({ text: 'DELETE FROM student WHERE id = $1 AND event_id = $2', params: [id, event.id] }, logStatement(event.id, acc.id, 'roll.remove', { studentId: id, name: `${st.surname}, ${st.first_name}` }));
      if (st.group_id) groups.push(st.group_id);
      rows.push({ rowId: id, removed: true });
    }
  }
  if (groups.length) statements.push(tidyEmptyGroups(event.id, groups));
  await transaction(statements);
  return { rows, notice: rows.find((r) => r.error)?.error ?? 'Removed.' };
}

// ── judges ────────────────────────────────────────────────────

export async function saveJudgesTable(eventId: string, changes: CellChange[]): Promise<GridResult> {
  const acc = await requireAdmin();
  const event = await getEvent(eventId);
  if (!event) return GONE;
  const rows: SavedRow[] = [];
  const signIns: NonNullable<GridResult['signIns']> = [];
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
        notices.push(`${existing.email} already had an account, as ${existing.display_name}, and is now a judge for ${event.title}. Their password is unchanged; select them and press Reset password if they have forgotten it.`);
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
      signIns.push({ name, login, password });
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
  return { rows, signIns, notice: notices.join(' ') || undefined };
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
  return { rows: [], signIns: [{ name: judge.display_name, login: judge.email, password }], notice: 'Password reset. The judge is signed out everywhere; the old password no longer works.' };
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
    const res = await applyCorrection(event, acc.id, ch.key, ch.rowId, ch.value, reason, { group: group.id, half });
    if (!res.ok) errors.set(ch.rowId, { ...(errors.get(ch.rowId) ?? {}), [ch.key]: res.error });
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
      rows.push({ rowId, errors: { absent: LOCKED_SENT } });
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


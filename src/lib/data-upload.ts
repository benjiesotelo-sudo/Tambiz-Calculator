// Applying an uploaded workbook (data-workbook.ts) to an event. Two lines are never crossed:
//  1. Uploading never removes anybody. It adds and updates students, groups, advisers and judges, matched on the
//     student number, the judge's email and the group's name (spacing, punctuation and capitals ignored).
//  2. Uploading never touches a score. It writes only student, adviser, tgroup, group_member, account, event_judge,
//     roll_import and change_log; tests/upload.test.ts checks every score table is identical before and after.
// A group left with no members and no score sheet by this upload (every member moved to another group) is tidied away.

import { logStatement } from './change-log';
import { newId, query, transaction, type Statement } from './db';
import { planJudges, planStudents, type ParsedWorkbook } from './data-workbook';
import { LOCKED_CLOSED, LOCKED_SENT } from './locks';
import { generatePassword, hashPassword } from './passwords';
import type { EventRow } from './repo';

/** A judge's sign-in details, shown once to print and hand out; never stored readable. */
export interface SignIn {
  name: string;
  login: string;
  password: string;
}

export interface UploadResult {
  ok: boolean;
  message: string;
  problems: string[];
  signIns: SignIn[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function applyUpload(event: EventRow, accountId: string, fileName: string, parsed: ParsedWorkbook): Promise<UploadResult> {
  if (event.released_at) return { ok: false, message: LOCKED_SENT, problems: [], signIns: [] };
  if (event.status === 'finalised') return { ok: false, message: `${LOCKED_CLOSED} Then upload again.`, problems: [], signIns: [] };

  const problems = [...parsed.problems];
  const statements: Statement[] = [];
  const counts = { studentsNew: 0, studentsChanged: 0, moved: 0, groupsNew: 0, advisersNew: 0, groupAdvisers: 0, judgesNew: 0, judgesAdded: 0, passwords: 0 };
  const emptied = new Set<string>();

  if (parsed.students) {
    const plan = planStudents(parsed.students);
    problems.push(...plan.problems);
    const has = (field: string) => parsed.students!.columns.has(field);
    const [students, groups, advisers] = await Promise.all([
      query<{ id: string; student_number: string; surname: string; first_name: string; middle_name: string; section: string; email: string; group_id: string | null }>(
        `SELECT s.id, s.student_number, s.surname, s.first_name, s.middle_name, s.section, s.email, m.group_id
         FROM student s LEFT JOIN group_member m ON m.student_id = s.id WHERE s.event_id = $1`,
        [event.id],
      ),
      query<{ id: string; name: string; name_key: string; adviser_id: string | null; members: number }>(
        `SELECT g.id, g.name, g.name_key, g.adviser_id, (SELECT count(*)::int FROM group_member m WHERE m.group_id = g.id) AS members FROM tgroup g WHERE g.event_id = $1`,
        [event.id],
      ),
      query<{ id: string; name: string; name_key: string; email: string }>('SELECT id, name, name_key, email FROM adviser WHERE event_id = $1', [event.id]),
    ]);

    const adviserIds = new Map<string, string>();
    for (const a of plan.advisers) {
      const found = advisers.find((x) => x.name_key === a.key);
      if (!found) {
        const id = newId();
        adviserIds.set(a.key, id);
        counts.advisersNew++;
        statements.push({ text: 'INSERT INTO adviser (id, event_id, name, name_key, email) VALUES ($1, $2, $3, $4, $5)', params: [id, event.id, a.name, a.key, a.email ?? ''] });
        continue;
      }
      adviserIds.set(a.key, found.id);
      const email = a.email ?? found.email;
      if (found.name !== a.name || found.email !== email) {
        statements.push({ text: 'UPDATE adviser SET name = $2, email = $3 WHERE id = $1', params: [found.id, a.name, email] });
        statements.push(logStatement(event.id, accountId, 'adviser.edit', { adviserId: found.id, file: fileName, from: { name: found.name, email: found.email }, to: { name: a.name, email } }));
      }
    }

    const groupIds = new Map<string, string>();
    const memberCount = new Map(groups.map((g) => [g.id, g.members]));
    for (const g of plan.groups) {
      const adviserId = adviserIds.get(g.adviserKey)!;
      const found = groups.find((x) => x.name_key === g.key);
      if (!found) {
        const id = newId();
        groupIds.set(g.key, id);
        counts.groupsNew++;
        statements.push(
          { text: 'INSERT INTO tgroup (id, event_id, name, name_key, adviser_id) VALUES ($1, $2, $3, $4, $5)', params: [id, event.id, g.name, g.key, adviserId] },
          logStatement(event.id, accountId, 'group.create', { id, name: g.name, file: fileName }),
        );
        continue;
      }
      groupIds.set(g.key, found.id);
      if (found.name !== g.name || found.adviser_id !== adviserId) {
        if (found.adviser_id !== adviserId) counts.groupAdvisers++;
        statements.push(
          { text: 'UPDATE tgroup SET name = $2, adviser_id = $3 WHERE id = $1', params: [found.id, g.name, adviserId] },
          logStatement(event.id, accountId, 'group.update', { groupId: found.id, file: fileName, from: { name: found.name, adviserId: found.adviser_id }, to: { name: g.name, adviserId } }),
        );
      }
    }

    const byNumber = new Map(students.map((s) => [s.student_number, s]));
    // Columns the sheet lacks keep what the app has; the required ones are always there.
    const fields = (['surname', 'first_name', 'middle_name', 'section', 'email'] as const).filter((f) => has(f));
    for (const s of plan.students) {
      const groupId = groupIds.get(s.groupKey)!;
      const before = byNumber.get(s.student_number);
      if (!before) {
        const id = newId();
        counts.studentsNew++;
        statements.push(
          {
            text: 'INSERT INTO student (id, event_id, student_number, email, surname, first_name, middle_name, section) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            params: [id, event.id, s.student_number, s.email, s.surname, s.first_name, s.middle_name ?? '', s.section ?? ''],
          },
          { text: 'INSERT INTO group_member (event_id, group_id, student_id) VALUES ($1, $2, $3)', params: [event.id, groupId, id] },
        );
        memberCount.set(groupId, (memberCount.get(groupId) ?? 0) + 1);
        continue;
      }
      const changed = fields.filter((f) => (s[f] ?? '') !== before[f]);
      if (changed.length) {
        counts.studentsChanged++;
        statements.push(
          { text: `UPDATE student SET ${changed.map((f, i) => `${f} = $${i + 2}`).join(', ')} WHERE id = $1`, params: [before.id, ...changed.map((f) => s[f] ?? '')] },
          logStatement(event.id, accountId, 'roll.edit', { studentId: before.id, file: fileName, changes: changed.map((f) => `${f}: ${before[f]} → ${s[f] ?? ''}`) }),
        );
      }
      if (before.group_id === groupId) continue;
      if (before.group_id) {
        counts.moved++;
        memberCount.set(before.group_id, (memberCount.get(before.group_id) ?? 1) - 1);
        if (!memberCount.get(before.group_id)) emptied.add(before.group_id);
        // Moving a student removes only their place in the old group. Their scores from it stay stored, and stop counting.
        statements.push({ text: 'DELETE FROM group_member WHERE event_id = $1 AND student_id = $2', params: [event.id, before.id] });
      }
      statements.push(
        { text: 'INSERT INTO group_member (event_id, group_id, student_id) VALUES ($1, $2, $3)', params: [event.id, groupId, before.id] },
        logStatement(event.id, accountId, before.group_id ? 'member.move' : 'member.add', { studentId: before.id, groupId, from: before.group_id, file: fileName }),
      );
      memberCount.set(groupId, (memberCount.get(groupId) ?? 0) + 1);
      emptied.delete(groupId);
    }
  }

  const signIns: SignIn[] = [];
  if (parsed.judges) {
    const plan = planJudges(parsed.judges);
    problems.push(...plan.problems);
    const accounts = await query<{ id: string; email: string; display_name: string; role: string; judging: boolean }>(
      `SELECT a.id, lower(a.email) AS email, a.display_name, a.role, EXISTS (SELECT 1 FROM event_judge j WHERE j.account_id = a.id AND j.event_id = $2) AS judging
       FROM account a WHERE lower(a.email) = ANY($1::text[])`,
      [plan.judges.map((j) => j.email), event.id],
    );
    for (const j of plan.judges) {
      const found = accounts.find((a) => a.email === j.email);
      if (found?.role === 'admin') {
        problems.push(`${j.email} is a coordinator’s sign-in, so it was not made a judge.`);
        continue;
      }
      if (!found) {
        const id = newId();
        const password = j.password || generatePassword();
        counts.judgesNew++;
        statements.push(
          { text: `INSERT INTO account (id, email, display_name, role, password_hash) VALUES ($1, $2, $3, 'judge', $4)`, params: [id, j.email, j.name, await hashPassword(password)] },
          { text: 'INSERT INTO event_judge (event_id, account_id) VALUES ($1, $2)', params: [event.id, id] },
          logStatement(event.id, accountId, 'judge.create', { id, email: j.email, file: fileName }),
        );
        signIns.push({ name: j.name, login: j.email, password });
        continue;
      }
      if (!found.judging) counts.judgesAdded++;
      // A judge from an earlier year keeps their account, so their record in Judge profiles stays together.
      statements.push(
        { text: 'INSERT INTO event_judge (event_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', params: [event.id, found.id] },
        { text: 'UPDATE account SET display_name = $2, disabled_at = NULL WHERE id = $1', params: [found.id, j.name] },
      );
      if (j.password) {
        counts.passwords++;
        statements.push(
          { text: 'UPDATE account SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1', params: [found.id, await hashPassword(j.password)] },
          { text: 'DELETE FROM session WHERE account_id = $1', params: [found.id] },
          logStatement(event.id, accountId, 'judge.password', { id: found.id, file: fileName }),
        );
        signIns.push({ name: j.name, login: j.email, password: j.password });
      }
    }
  }

  // Groups this upload left empty, never one with a score sheet (deleting a group would delete its sheets).
  if (emptied.size) {
    statements.push({
      text: `DELETE FROM tgroup g WHERE g.event_id = $1 AND g.id = ANY($2::text[])
             AND NOT EXISTS (SELECT 1 FROM group_member m WHERE m.group_id = g.id) AND NOT EXISTS (SELECT 1 FROM score_sheet s WHERE s.group_id = g.id)`,
      params: [event.id, [...emptied]],
    });
  }
  const rows = (parsed.students?.lines.length ?? 0) + (parsed.judges?.lines.length ?? 0);
  statements.push(
    {
      text: 'INSERT INTO roll_import (id, event_id, kind, file_name, row_count, added, updated) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      params: [newId(), event.id, 'workbook', fileName, rows, counts.studentsNew + counts.judgesNew, counts.studentsChanged + counts.moved],
    },
    logStatement(event.id, accountId, 'workbook.upload', { file: fileName, ...counts, problems: problems.length }),
  );
  await transaction(statements);

  const parts = [
    parsed.students ? `${plural(counts.studentsNew, 'new student')}, ${plural(counts.studentsChanged, 'student')} with changed details, ${plural(counts.moved, 'student')} moved to another group` : '',
    parsed.students ? `${plural(counts.groupsNew, 'new group')}, ${plural(counts.advisersNew, 'new adviser')}, ${plural(counts.groupAdvisers, 'group')} given a different adviser` : '',
    parsed.judges ? `${plural(counts.judgesNew, 'new judge')}, ${plural(counts.judgesAdded, 'judge')} from an earlier event added, ${plural(counts.passwords, 'password')} changed` : '',
  ].filter(Boolean);
  const missing = [!parsed.students ? 'no Students sheet, so no student changed' : '', !parsed.judges ? 'no Judges sheet, so no judge changed' : ''].filter(Boolean);
  const message = `Uploaded ${fileName}: ${parts.join('; ')}.${missing.length ? ` The file had ${missing.join(', and ')}.` : ''} No one was removed and no score changed.`;
  return { ok: true, message, problems, signIns };
}

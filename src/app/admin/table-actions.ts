'use server';

// Saves from the coordinator's spreadsheet tables. Each action checks the caller itself, applies the same rules as the
// forms, and returns only the rows it changed, so a page never reloads everything to change one cell.

import { requireAdmin } from '@/lib/auth';
import { logStatement } from '@/lib/change-log';
import { one, transaction } from '@/lib/db';
import { changesByRow, isNewRow, type CellChange, type GridResult, type SavedRow } from '@/lib/grid';
import { editGroup, nextGroupCode, removeGroup } from '@/lib/group-edit';
import { getEvent, getGroup, type StudentRow } from '@/lib/repo';
import { groupGridRow, memberGridRow } from '@/lib/tables';

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

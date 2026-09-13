import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/auth';
import { newId, one, query, transaction, type Statement } from '@/lib/db';
import { getEvent } from '@/lib/repo';
import { criteriaOf, findCriterion, type Half } from '@/lib/rubric';
import { refuseReason } from '@/lib/sheet';

export const dynamic = 'force-dynamic';

interface Body {
  groupId?: string;
  half?: Half;
  changes?: { key: string; value: number | null }[];
  complete?: boolean;
}

const fail = (status: number, error: string, extra: object = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

export async function POST(req: Request) {
  const acc = await currentAccount();
  if (!acc) return fail(401, 'Your session has ended. Sign in again to send your scores.');
  if (acc.role !== 'judge') return fail(403, 'Only judges can score.');

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Bad request.');
  }
  const half = body.half;
  if (half !== 'defense' && half !== 'booth') return fail(400, 'Unknown half.');

  const group = await one<{ id: string; event_id: string }>(
    `SELECT g.id, g.event_id FROM tgroup g JOIN event_judge j ON j.event_id = g.event_id AND j.account_id = $2 WHERE g.id = $1`,
    [body.groupId ?? '', acc.id],
  );
  if (!group) return fail(404, 'This group is not in an event you are judging.');
  const event = await getEvent(group.event_id);
  if (!event) return fail(404, 'Event not found.');
  if (event.status === 'finalised') return fail(423, 'Judging is closed for this event. These scores were not accepted.');

  await query(`INSERT INTO score_sheet (id, event_id, group_id, half, judge_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (group_id, half, judge_id) DO NOTHING`, [
    newId(),
    event.id,
    group.id,
    half,
    acc.id,
  ]);
  const sheet = (await one<{ id: string; status: string }>('SELECT id, status FROM score_sheet WHERE group_id = $1 AND half = $2 AND judge_id = $3', [group.id, half, acc.id]))!;

  const changes = Array.isArray(body.changes) ? body.changes : [];
  const statements: Statement[] = [];
  const refused: { key: string; message: string }[] = [];

  if (changes.length) {
    if (sheet.status === 'complete' && body.complete !== false) {
      return fail(409, 'This group is marked complete. Tap “Edit scores” first.');
    }
    const memberIds =
      half === 'defense' ? new Set((await query<{ student_id: string }>('SELECT student_id FROM group_member WHERE group_id = $1', [group.id])).map((r) => r.student_id)) : new Set<string>();

    for (const ch of changes) {
      const parts = String(ch.key).split(':');
      let max: number | null = null;
      if (parts[0] === 'c' && parts.length === 3) {
        max = findCriterion(event.rubric, half, `${parts[1]}:${parts[2]}`)?.max ?? null;
      } else if (parts[0] === 'm' && parts.length === 3 && half === 'defense' && memberIds.has(parts[1])) {
        max = event.rubric.memberFields.find((f) => f.key === parts[2])?.max ?? null;
      }
      if (max === null) {
        refused.push({ key: ch.key, message: 'Unknown score box.' });
        continue;
      }
      const reason = refuseReason(ch.value, max);
      if (reason) {
        refused.push({ key: ch.key, message: reason });
        continue;
      }
      if (parts[0] === 'c') {
        const ck = `${parts[1]}:${parts[2]}`;
        statements.push(
          ch.value === null
            ? { text: 'DELETE FROM score_value WHERE sheet_id = $1 AND criterion_key = $2', params: [sheet.id, ck] }
            : {
                text: `INSERT INTO score_value (sheet_id, criterion_key, value) VALUES ($1, $2, $3)
                       ON CONFLICT (sheet_id, criterion_key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
                params: [sheet.id, ck, ch.value],
              },
        );
      } else {
        statements.push(
          ch.value === null
            ? { text: 'DELETE FROM member_score WHERE sheet_id = $1 AND student_id = $2 AND field = $3', params: [sheet.id, parts[1], parts[2]] }
            : {
                text: `INSERT INTO member_score (sheet_id, student_id, field, value) VALUES ($1, $2, $3, $4)
                       ON CONFLICT (sheet_id, student_id, field) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
                params: [sheet.id, parts[1], parts[2], ch.value],
              },
        );
      }
    }
  }

  if (body.complete === false) statements.push({ text: `UPDATE score_sheet SET status = 'in_progress', completed_at = NULL WHERE id = $1`, params: [sheet.id] });
  if (statements.length) {
    statements.push({ text: 'UPDATE score_sheet SET updated_at = now() WHERE id = $1', params: [sheet.id] });
    statements.push({
      text: 'INSERT INTO change_log (id, event_id, account_id, action, detail) VALUES ($1, $2, $3, $4, $5::jsonb)',
      params: [newId(), event.id, acc.id, 'scores', JSON.stringify({ sheet: sheet.id, changes: changes.filter((c) => !refused.some((r) => r.key === c.key)), complete: body.complete })],
    });
    await transaction(statements);
  }

  let status = body.complete === false ? 'in_progress' : sheet.status;
  if (body.complete === true) {
    const counts = await one<{ values: number; members: number; needed_members: number }>(
      `SELECT (SELECT count(*)::int FROM score_value WHERE sheet_id = $1) AS values,
              (SELECT count(*)::int FROM member_score ms JOIN group_member gm ON gm.student_id = ms.student_id AND gm.group_id = $2 WHERE ms.sheet_id = $1) AS members,
              (SELECT count(*)::int FROM group_member WHERE group_id = $2) AS needed_members`,
      [sheet.id, group.id],
    );
    const neededValues = criteriaOf(event.rubric, half).length;
    const neededMembers = half === 'defense' ? counts!.needed_members * event.rubric.memberFields.length : 0;
    const blanks = neededValues - counts!.values + (half === 'defense' ? neededMembers - counts!.members : 0);
    if (blanks > 0) return fail(422, `${blanks} score${blanks === 1 ? ' is' : 's are'} still blank on the server. Check your connection, then try again.`, { refused });
    await query(`UPDATE score_sheet SET status = 'complete', completed_at = now() WHERE id = $1`, [sheet.id]);
    status = 'complete';
  }

  return NextResponse.json({ ok: true, status, refused });
}

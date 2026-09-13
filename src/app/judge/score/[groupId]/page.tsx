import { notFound } from 'next/navigation';
import { ScoreSheet } from '@/components/ScoreSheet';
import { requireJudge } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { eventForJudge, getGroup, groupMembers } from '@/lib/repo';
import type { Half } from '@/lib/rubric';
import { critKey, memberKey } from '@/lib/sheet';

export const dynamic = 'force-dynamic';

export default async function ScorePage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ half?: string }> }) {
  const acc = await requireJudge();
  const { groupId } = await params;
  const half: Half = (await searchParams).half === 'booth' ? 'booth' : 'defense';
  const event = await eventForJudge(acc.id);
  if (!event) notFound();
  const group = await getGroup(event.id, groupId);
  if (!group) notFound();
  const members = half === 'defense' ? await groupMembers(group.id) : [];

  const sheet = await one<{ id: string; status: string }>('SELECT id, status FROM score_sheet WHERE group_id = $1 AND half = $2 AND judge_id = $3', [group.id, half, acc.id]);
  const initial: Record<string, number> = {};
  if (sheet) {
    const [vals, mems] = await Promise.all([
      query<{ criterion_key: string; value: number }>('SELECT criterion_key, value FROM score_value WHERE sheet_id = $1', [sheet.id]),
      query<{ student_id: string; field: string; value: number }>('SELECT student_id, field, value FROM member_score WHERE sheet_id = $1', [sheet.id]),
    ]);
    for (const v of vals) {
      const [cat, i] = v.criterion_key.split(':');
      initial[critKey(cat, +i)] = Number(v.value);
    }
    for (const m of mems) initial[memberKey(m.student_id, m.field)] = Number(m.value);
  }

  return (
    <ScoreSheet
      eventTitle={event.title}
      judgeId={acc.id}
      judgeName={acc.display_name}
      closed={event.status === 'finalised'}
      half={half}
      rubric={event.rubric}
      group={{ id: group.id, code: group.code, name: group.name, section: group.section, adviser: group.adviser_name ?? 'No adviser' }}
      members={members.map((m) => ({ id: m.id, name: `${m.first_name} ${m.surname}`, initials: (m.first_name[0] ?? '') + (m.surname[0] ?? ''), section: m.section }))}
      initial={initial}
      initialComplete={sheet?.status === 'complete'}
    />
  );
}

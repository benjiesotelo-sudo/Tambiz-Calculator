import { AppBar } from '@/components/AppBar';
import { GroupList, type JudgeGroup } from '@/components/GroupList';
import { requireJudge } from '@/lib/auth';
import { query } from '@/lib/db';
import { eventForJudge, listGroups } from '@/lib/repo';
import { criteriaOf } from '@/lib/rubric';

export const dynamic = 'force-dynamic';

export default async function JudgeHome() {
  const acc = await requireJudge();
  const event = await eventForJudge(acc.id);
  if (!event) {
    return (
      <>
        <AppBar subtitle="Judge scoring" account={acc} />
        <main className="page narrow">
          <h1 className="page-title">No event yet</h1>
          <p className="lead">You have not been added to a Tambiz event. Ask the coordinator to add you as a judge.</p>
        </main>
      </>
    );
  }
  const [groups, sheets] = await Promise.all([
    listGroups(event.id),
    query<{ group_id: string; half: 'defense' | 'booth'; status: string; values: number }>(
      `SELECT s.group_id, s.half, s.status, (SELECT count(*)::int FROM score_value v WHERE v.sheet_id = s.id) AS values FROM score_sheet s WHERE s.event_id = $1 AND s.judge_id = $2`,
      [event.id, acc.id],
    ),
  ]);
  const data: JudgeGroup[] = groups.map((g) => {
    const status = (half: 'defense' | 'booth') => {
      const sh = sheets.find((s) => s.group_id === g.id && s.half === half);
      return { filled: sh?.values ?? 0, total: criteriaOf(event.rubric, half).length, complete: sh?.status === 'complete' };
    };
    return { id: g.id, name: g.name, section: g.section, adviser: g.adviser_name ?? 'No adviser', defense: status('defense'), booth: status('booth') };
  });

  return (
    <>
      <AppBar title={event.title} subtitle="Judge scoring" account={acc} home="/judge" />
      {event.status === 'finalised' ? (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice warn">Judging is closed. You can still look at your scores, but changes are no longer accepted.</div>
        </div>
      ) : null}
      <GroupList judgeId={acc.id} groups={data} />
    </>
  );
}

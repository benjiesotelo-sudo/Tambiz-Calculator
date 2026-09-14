import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { one } from '@/lib/db';
import { getEvent } from '@/lib/repo';
import { categoryMax } from '@/lib/rubric';
import { setEventStatus } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function EventHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const c = (await one<{ students: number; unplaced: number; groups: number; no_adviser: number; judges: number; sheets: number; complete: number }>(
    `SELECT (SELECT count(*)::int FROM student WHERE event_id = $1) AS students,
            (SELECT count(*)::int FROM student s WHERE s.event_id = $1 AND NOT EXISTS (SELECT 1 FROM group_member m WHERE m.student_id = s.id)) AS unplaced,
            (SELECT count(*)::int FROM tgroup WHERE event_id = $1) AS groups,
            (SELECT count(*)::int FROM tgroup WHERE event_id = $1 AND adviser_id IS NULL) AS no_adviser,
            (SELECT count(*)::int FROM event_judge WHERE event_id = $1) AS judges,
            (SELECT count(*)::int FROM score_sheet WHERE event_id = $1) AS sheets,
            (SELECT count(*)::int FROM score_sheet WHERE event_id = $1 AND status = 'complete') AS complete`,
    [id],
  ))!;
  const base = `/admin/events/${id}`;
  const tile = (href: string, title: string, stat: string, note: string) => (
    <Link className="tile" href={href}>
      <b>{title}</b>
      <div className="stat">{stat}</div>
      <div className="sub">{note}</div>
    </Link>
  );

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="" />
        <Notice ok={sp.ok} error={sp.error} />

        <div className="card">
          <h3>Where the event stands</h3>
          <p className="sub" style={{ marginTop: 0 }}>
            Set-up → Judging open → Judging closed. Judges can score during set-up and while judging is open, so you can rehearse.
          </p>
          <div className="actions">
            {(['setup', 'judging'] as const).map((st) =>
              st === event.status ? null : (
                <form key={st} action={setEventStatus}>
                  <input type="hidden" name="eventId" value={id} />
                  <input type="hidden" name="status" value={st} />
                  <button className={`btn small ${st === 'judging' ? '' : 'secondary'}`} type="submit">
                    {st === 'judging' ? (event.status === 'finalised' ? 'Reopen judging' : 'Open judging') : 'Back to set-up'}
                  </button>
                </form>
              ),
            )}
            {event.status !== 'finalised' ? (
              <Link className="btn small gold" href={`${base}/progress#close`}>
                Close judging…
              </Link>
            ) : null}
            <a className="btn small secondary" href={`/api/admin/events/${id}/export`}>
              Download Excel workbook
            </a>
          </div>
        </div>

        <div className="grid">
          {tile(`${base}/roll`, 'Class roll', String(c.students), c.unplaced ? `${c.unplaced} not in any group yet` : 'Every student is in a group')}
          {tile(`${base}/groups`, 'Groups', String(c.groups), c.no_adviser ? `${c.no_adviser} without an adviser` : 'All have an adviser')}
          {tile(`${base}/judges`, 'Judges', String(c.judges), 'Accounts that can score this event')}
          {tile(`${base}/progress`, 'Judging progress', `${c.complete}/${c.sheets}`, 'Score sheets marked complete')}
          {tile(`${base}/results`, 'Results', '🏆', 'Category ranks, overall and top 10')}
          {tile(`${base}/grades`, 'Individual grades', 'A–F', 'Member totals and letter grades by section')}
        </div>

        <div className="section-title">Scoring sheet</div>
        {(() => {
          const all = (['defense', 'booth'] as const).flatMap((h) => event.rubric.halves[h].categories.flatMap((cat) => cat.maxes.map((_, i) => cat.criteria?.[i] ?? '')));
          const worded = all.filter((t) => t.trim()).length;
          return (
            <div className={`notice ${worded === all.length ? 'ok' : 'warn'}`}>
              {worded === all.length ? `All ${all.length} criteria have their wording.` : `${worded} of ${all.length} criteria have wording; judges see “Criterion 1, 2, 3…” for the rest.`}{' '}
              <Link href={`${base}/sheet`}>{worded === all.length ? 'Edit the wording' : 'Enter the criterion wording'}</Link>
            </div>
          );
        })()}
        <div className="grid">
          {(['defense', 'booth'] as const).map((h) => (
            <div className="card" key={h}>
              <h3>
                {event.rubric.halves[h].label} · {Math.round(event.rubric.halves[h].weight * 100)}% of overall
              </h3>
              <ul className="sub" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {event.rubric.halves[h].categories.map((cat) => (
                  <li key={cat.key}>
                    {cat.name}: {cat.maxes.length} criteria, {categoryMax(cat)} points ({cat.maxes.join(' · ')})
                  </li>
                ))}
                {h === 'defense' ? <li>Members: {event.rubric.memberFields.map((f) => `${f.name} /${f.max}`).join(', ')}</li> : null}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

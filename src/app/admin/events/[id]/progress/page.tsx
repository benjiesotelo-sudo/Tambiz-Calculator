import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { eventJudges, eventReport, getEvent } from '@/lib/repo';
import { criteriaOf, type Half } from '@/lib/rubric';
import { setEventStatus } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ProgressPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [report, judges] = await Promise.all([eventReport(event), eventJudges(id)]);
  const halves: Half[] = ['defense', 'booth'];
  const needed = { defense: criteriaOf(event.rubric, 'defense').length, booth: criteriaOf(event.rubric, 'booth').length };

  const summary = halves.map((h) => {
    const withAny = report.groups.filter((g) => report.sheets.some((s) => s.group_id === g.id && s.half === h && (report.filled.get(s.id) ?? 0) > 0)).length;
    const withComplete = report.groups.filter((g) => report.sheets.some((s) => s.group_id === g.id && s.half === h && s.status === 'complete')).length;
    return { h, withAny, withComplete };
  });

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="progress" title="Judging progress" />
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          For every group, how many judges have scored it in each half. <span className="pill done">✓ 2</span> means two judges marked it complete;{' '}
          <span className="pill part">1 in progress</span> means a judge has started but not finished.
        </p>
        <div className="grid">
          {summary.map((x) => (
            <div className="tile" key={x.h}>
              <b>{event.rubric.halves[x.h].label}</b>
              <div className="stat">
                {x.withComplete}/{report.groups.length}
              </div>
              <div className="sub">
                groups with a complete sheet · {x.withAny} with any scores
              </div>
            </div>
          ))}
        </div>

        <div className="section-title">By group</div>
        <ul className="list">
          {report.groups.map((g) => (
            <li key={g.id} style={{ display: 'block' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span className="code">{g.code}</span>
                <Link href={`/admin/events/${id}/groups/${g.id}`} className="title" style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
                  {g.name}
                </Link>
              </div>
              {halves.map((h) => {
                const sheets = report.sheets.filter((s) => s.group_id === g.id && s.half === h && ((report.filled.get(s.id) ?? 0) > 0 || s.status === 'complete'));
                const done = sheets.filter((s) => s.status === 'complete');
                const part = sheets.filter((s) => s.status !== 'complete');
                return (
                  <div key={h} className="judgechips" style={{ alignItems: 'center' }}>
                    <span className={`pill ${h}`} style={{ minWidth: 70, textAlign: 'center' }}>
                      {event.rubric.halves[h].label}
                    </span>
                    {!sheets.length ? <span className="pill err">No scores</span> : null}
                    {done.length ? <span className="pill done">✓ {done.length}</span> : null}
                    {part.length ? <span className="pill part">{part.length} in progress</span> : null}
                    <span className="sub" style={{ overflowWrap: 'anywhere' }}>
                      {sheets.map((s) => `${s.judge_name}${s.status === 'complete' ? '' : ` (${report.filled.get(s.id) ?? 0}/${needed[h]})`}`).join(', ')}
                    </span>
                  </div>
                );
              })}
            </li>
          ))}
          {!report.groups.length ? <li className="sub">No groups yet.</li> : null}
        </ul>

        <div className="section-title">By judge</div>
        <ul className="list">
          {judges.map((j) => {
            const mine = report.sheets.filter((s) => s.judge_id === j.id);
            return (
              <li key={j.id}>
                <span className="grow-1">
                  <span className="title">{j.display_name}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {halves
                      .map((h) => {
                        const x = mine.filter((s) => s.half === h);
                        return x.length ? `${event.rubric.halves[h].label}: ${x.filter((s) => s.status === 'complete').length} complete, ${x.filter((s) => s.status !== 'complete').length} in progress` : null;
                      })
                      .filter(Boolean)
                      .join(' · ') || 'Has not scored yet'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="section-title" id="close">
          Close judging
        </div>
        {event.status === 'finalised' ? (
          <div className="card">
            <p style={{ marginTop: 0 }}>Judging is closed. Judges can no longer change scores.</p>
            <form action={setEventStatus}>
              <input type="hidden" name="eventId" value={id} />
              <input type="hidden" name="status" value="judging" />
              <button className="btn secondary" type="submit">
                Reopen judging
              </button>
            </form>
          </div>
        ) : (
          <form action={setEventStatus} className="card form">
            <input type="hidden" name="eventId" value={id} />
            <input type="hidden" name="status" value="finalised" />
            <p style={{ margin: 0 }}>
              Closing judging locks every judge’s scores. Results and grades are then final, and the Excel workbook is ready to download. Anything still blank is left out, never
              counted as zero, and a group that is not fully judged stays incomplete without a rank, so check the list above first.
            </p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="checkbox" name="confirm" value="yes" style={{ width: 22, height: 22 }} /> I have checked the progress above
            </label>
            <button className="btn gold" type="submit">
              Close judging
            </button>
          </form>
        )}
      </main>
    </>
  );
}

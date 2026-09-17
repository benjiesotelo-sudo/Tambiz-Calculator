import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { eventJudges, eventReport, getEvent } from '@/lib/repo';
import { criteriaOf, type Half } from '@/lib/rubric';
import { scoresHref } from '@/lib/tables';

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

  // Only submitted sheets count; sheets in progress are shown apart so nobody mistakes them for scores.
  const summary = halves.map((h) => {
    const withComplete = report.groups.filter((g) => report.sheets.some((s) => s.group_id === g.id && s.half === h)).length;
    const withOpenOnly = report.groups.filter(
      (g) => !report.sheets.some((s) => s.group_id === g.id && s.half === h) && report.openSheets.some((s) => s.group_id === g.id && s.half === h && (report.filled.get(s.id) ?? 0) > 0),
    ).length;
    return { h, withComplete, withOpenOnly };
  });

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="progress" title="Judging progress" />
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          For every group, how many judges have scored it in each half. <span className="pill done">✓ 2 submitted</span> means two judges marked it complete, and
          only those scores count. <span className="pill none">1 in progress · not counted</span> means a judge has started but not submitted: none of those scores
          count until the judge taps <b>Mark group complete</b>. Tap a group, or its Defense or Booth label, to see and correct its scores.
        </p>
        <div className="grid">
          {summary.map((x) => (
            <div className="tile" key={x.h}>
              <b>{event.rubric.halves[x.h].label}</b>
              <div className="stat">
                {x.withComplete}/{report.groups.length}
              </div>
              <div className="sub">
                groups with a submitted sheet{x.withOpenOnly ? ` · ${x.withOpenOnly} more only in progress, not counted yet` : ''}
              </div>
            </div>
          ))}
        </div>

        <div className="section-title">By group</div>
        <ul className="list">
          {report.groups.map((g) => (
            <li key={g.id} style={{ display: 'block' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <Link href={scoresHref(id, g.id)} className="title" style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
                  {g.name}
                </Link>
              </div>
              {halves.map((h) => {
                const done = report.sheets.filter((s) => s.group_id === g.id && s.half === h);
                const part = report.openSheets.filter((s) => s.group_id === g.id && s.half === h && (report.filled.get(s.id) ?? 0) > 0);
                const sheets = [...done, ...part];
                return (
                  <div key={h} className="judgechips" style={{ alignItems: 'center' }}>
                    <Link href={scoresHref(id, g.id, h)} className={`pill ${h}`} style={{ minWidth: 70, textAlign: 'center', textDecoration: 'none' }}>
                      {event.rubric.halves[h].label}
                    </Link>
                    {!done.length ? <span className="pill err">{part.length ? 'Nothing submitted' : 'No scores'}</span> : null}
                    {done.length ? <span className="pill done">✓ {done.length} submitted</span> : null}
                    {done.length === 1 ? <span className="pill part">only 1</span> : null}
                    {part.length ? <span className="pill none">{part.length} in progress · not counted</span> : null}
                    <span className="sub" style={{ overflowWrap: 'anywhere' }}>
                      {[
                        ...done.map((s) => `${s.judge_name} ✓`),
                        ...part.map((s) => `${s.judge_name} (in progress, ${report.filled.get(s.id) ?? 0}/${needed[h]}, not counted)`),
                      ].join(', ')}
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
            const submitted = report.sheets.filter((s) => s.judge_id === j.id);
            const open = report.openSheets.filter((s) => s.judge_id === j.id);
            return (
              <li key={j.id}>
                <span className="grow-1">
                  <span className="title">{j.display_name}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {halves
                      .map((h) => {
                        const done = submitted.filter((s) => s.half === h).length;
                        const part = open.filter((s) => s.half === h).length;
                        return done || part ? `${event.rubric.halves[h].label}: ${done} submitted, ${part} in progress (not counted)` : null;
                      })
                      .filter(Boolean)
                      .join(' · ') || 'Has not scored yet'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

      </main>
    </>
  );
}

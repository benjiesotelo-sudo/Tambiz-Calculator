import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { itemsNeedYou, type Check } from '@/lib/finalise';
import { eventFinaliseChecks, eventJudges, eventReport, getEvent } from '@/lib/repo';
import { criteriaOf, type Half } from '@/lib/rubric';
import { acceptGroup, clearAcceptance, excludeStudent, includeStudent, setEventStatus, setMemberAbsent } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function ProgressPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [report, judges] = await Promise.all([eventReport(event), eventJudges(id)]);
  const checks = await eventFinaliseChecks(report);
  const halves: Half[] = ['defense', 'booth'];
  const needed = { defense: criteriaOf(event.rubric, 'defense').length, booth: criteriaOf(event.rubric, 'booth').length };
  const here = `/admin/events/${id}/progress`;
  const groupOfStudent = new Map(report.grades.map((g) => [g.student.id, g.group.id]));

  const summary = halves.map((h) => {
    const withAny = report.groups.filter((g) => report.sheets.some((s) => s.group_id === g.id && s.half === h && (report.filled.get(s.id) ?? 0) > 0)).length;
    const withComplete = report.groups.filter((g) => report.sheets.some((s) => s.group_id === g.id && s.half === h && s.status === 'complete')).length;
    return { h, withAny, withComplete };
  });

  const hidden = (fields: Record<string, string>) => Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  const blockerActions = (b: Check) => {
    if (b.kind === 'group') {
      return (
        <details className="inline-form">
          <summary>Close judging for this group with the scores it has…</summary>
          <form action={acceptGroup} className="form">
            {hidden({ eventId: id, groupId: b.id, return: here })}
            <label className="field">
              <span className="label-text">Reason, kept with the results</span>
              <input className="input" name="reason" required minLength={3} maxLength={200} placeholder="For example: did not run a booth" />
            </label>
            <button className="btn small" type="submit">
              Accept with this reason
            </button>
          </form>
        </details>
      );
    }
    if (b.kind === 'student') {
      return (
        <details className="inline-form">
          <summary>Leave this student out with a reason…</summary>
          <form action={excludeStudent} className="form">
            {hidden({ eventId: id, studentId: b.id, return: here })}
            <label className="field">
              <span className="label-text">Reason</span>
              <input className="input" name="reason" required minLength={3} maxLength={200} placeholder="For example: dropped the course" />
            </label>
            <button className="btn small" type="submit">
              Leave out
            </button>
            <span className="sub">
              Or place them in a group from the <Link href={`/admin/events/${id}/roll`}>Class roll</Link> tab.
            </span>
          </form>
        </details>
      );
    }
    const gid = groupOfStudent.get(b.id) ?? '';
    return (
      <div className="actions">
        <form action={setMemberAbsent}>
          {hidden({ eventId: id, groupId: gid, studentId: b.id, absent: 'yes', return: here })}
          <button className="btn small secondary" type="submit">
            Mark absent from the defense
          </button>
        </form>
        <Link className="btn small secondary" href={`/admin/events/${id}/groups/${gid}/scores?half=defense`}>
          See their scores
        </Link>
      </div>
    );
  };

  const blockerList = checks.blockers.length ? (
    <ul className="list">
      {checks.blockers.map((b) => (
        <li key={`${b.kind}:${b.id}:${b.text}`} style={{ display: 'block' }}>
          <div className="title" style={{ marginBottom: 6 }}>
            <span className="pill err">Needs you</span> {b.text}
          </div>
          {blockerActions(b)}
        </li>
      ))}
    </ul>
  ) : null;

  const undo = (d: Check) => {
    if (d.kind === 'group')
      return (
        <form action={clearAcceptance}>
          {hidden({ eventId: id, groupId: d.id, return: here })}
          <button className="btn small secondary" type="submit" disabled={!!event.released_at}>
            Undo
          </button>
        </form>
      );
    if (d.kind === 'student')
      return (
        <form action={includeStudent}>
          {hidden({ eventId: id, studentId: d.id, return: here })}
          <button className="btn small secondary" type="submit">
            Undo
          </button>
        </form>
      );
    return (
      <form action={setMemberAbsent}>
        {hidden({ eventId: id, groupId: groupOfStudent.get(d.id) ?? '', studentId: d.id, absent: 'no', return: here })}
        <button className="btn small secondary" type="submit" disabled={!!event.released_at}>
          Not absent
        </button>
      </form>
    );
  };

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="progress" title="Judging progress" />
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          For every group, how many judges have scored it in each half. <span className="pill done">✓ 2</span> means two judges marked it complete;{' '}
          <span className="pill part">1 in progress</span> means a judge has started but not finished. Tap a group to see and correct its scores.
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
                    <Link href={`/admin/events/${id}/groups/${g.id}/scores?half=${h}`} className={`pill ${h}`} style={{ minWidth: 70, textAlign: 'center', textDecoration: 'none' }}>
                      {event.rubric.halves[h].label}
                    </Link>
                    {!sheets.length ? <span className="pill err">No scores</span> : null}
                    {done.length ? <span className="pill done">✓ {done.length}</span> : null}
                    {done.length === 1 ? <span className="pill part">only 1</span> : null}
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
            <p style={{ marginTop: 0 }}>Judging is closed. Judges can no longer change scores. You can still correct a score, with a reason, until results are released.</p>
            {event.released_at ? (
              <p className="sub" style={{ marginBottom: 0 }}>
                Results were released on {new Date(event.released_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long' })}, so judging cannot be reopened.
              </p>
            ) : (
              <>
                {checks.blockers.length ? (
                  <div className="notice err">
                    Something changed after judging closed: {itemsNeedYou(checks.blockers.length)} you before results can be released.
                  </div>
                ) : null}
                {blockerList}
                <form action={setEventStatus}>
                  <input type="hidden" name="eventId" value={id} />
                  <input type="hidden" name="status" value="judging" />
                  <button className="btn secondary" type="submit">
                    Reopen judging
                  </button>
                </form>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="sub" style={{ marginTop: 0 }}>
              Judging can close only when every group is fully judged in both halves, every student on the roll is in a group, and every group member has member scores. For
              anything that cannot be, record a reason below.
            </p>
            {checks.blockers.length ? (
              <div className="notice err">{itemsNeedYou(checks.blockers.length)} you before judging can close.</div>
            ) : (
              <div className="notice ok">Nothing is in the way of closing judging.</div>
            )}
            {blockerList}
          </>
        )}
        {checks.warnings.length ? (
          <>
            <p className="sub">Worth a look, but these do not stop judging from closing:</p>
            <ul className="list">
              {checks.warnings.map((w) => (
                <li key={`${w.id}:${w.text}`}>
                  <span className="pill part">Check</span>
                  <span className="grow-1" style={{ overflowWrap: 'anywhere' }}>
                    {w.text}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {checks.decided.length ? (
          <>
            <p className="sub">Already decided by you:</p>
            <ul className="list">
              {checks.decided.map((d) => (
                <li key={`${d.kind}:${d.id}`} style={{ flexWrap: 'wrap' }}>
                  <span className="grow-1" style={{ minWidth: 200, overflowWrap: 'anywhere' }}>
                    {d.text}
                  </span>
                  {undo(d)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {event.status !== 'finalised' ? (
          <form action={setEventStatus} className="card form" style={{ marginTop: 14 }}>
            <input type="hidden" name="eventId" value={id} />
            <input type="hidden" name="status" value="finalised" />
            <p style={{ margin: 0 }}>
              Closing judging locks every judge’s scores, and results and grades become final. A blank score is never counted as zero. You can reopen judging, or correct a score
              with a reason, until results are released.
            </p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="checkbox" name="confirm" value="yes" style={{ width: 22, height: 22 }} /> I have checked the progress above
            </label>
            <button className="btn gold" type="submit" disabled={checks.blockers.length > 0}>
              Close judging
            </button>
          </form>
        ) : null}
      </main>
    </>
  );
}

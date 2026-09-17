import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { emailRecipients } from '@/lib/email-file';
import { itemsNeedYou, type Check } from '@/lib/finalise';
import { eventFinaliseChecks, eventReport, getEvent, listAdvisers } from '@/lib/repo';
import { scoresHref } from '@/lib/tables';
import { acceptGroup, clearAcceptance, closeEvent, setMemberAbsent, undoClose } from '../../../actions';

export const dynamic = 'force-dynamic';

// Close the event: what still needs the coordinator, the close itself, and the two files it hands over. Closing can be
// undone, with a warning, until the email file has been downloaded.

const when = (d: Date) => new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long', timeStyle: 'short' });

export default async function ClosePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [report, advisers] = await Promise.all([eventReport(event), listAdvisers(id)]);
  const checks = eventFinaliseChecks(report);
  const recipients = emailRecipients(report, advisers);
  const closed = event.status === 'finalised';
  const sent = !!event.released_at;
  const here = `/admin/events/${id}/close`;
  const groupOfStudent = new Map(report.grades.map((g) => [g.student.id, g.group.id]));
  const noSection = report.grades.filter((g) => !g.student.section.trim()).length;

  const hidden = (fields: Record<string, string>) => Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  const blockerActions = (b: Check) => {
    if (b.kind === 'group') {
      return (
        <details className="inline-form">
          <summary>Close this group with the scores it has…</summary>
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
    const gid = groupOfStudent.get(b.id) ?? '';
    return (
      <div className="actions">
        <form action={setMemberAbsent}>
          {hidden({ eventId: id, groupId: gid, studentId: b.id, absent: 'yes', return: here })}
          <button className="btn small secondary" type="submit">
            Mark absent from the defense
          </button>
        </form>
        <Link className="btn small secondary" href={scoresHref(id, gid)}>
          See their scores
        </Link>
      </div>
    );
  };

  const undo = (d: Check) =>
    d.kind === 'group' ? (
      <form action={clearAcceptance}>
        {hidden({ eventId: id, groupId: d.id, return: here })}
        <button className="btn small secondary" type="submit" disabled={sent}>
          Undo
        </button>
      </form>
    ) : (
      <form action={setMemberAbsent}>
        {hidden({ eventId: id, groupId: groupOfStudent.get(d.id) ?? '', studentId: d.id, absent: 'no', return: here })}
        <button className="btn small secondary" type="submit" disabled={sent}>
          Not absent
        </button>
      </form>
    );

  const sectionNote = noSection ? (
    <div className="notice warn">
      {noSection} student{noSection === 1 ? ' has' : 's have'} no section. The For Encoding grade sheet is sorted by section, so it cannot be organised by section for{' '}
      {noSection === 1 ? 'that student' : 'those students'}: they are listed together, before everyone else. Add sections on the Data tab if the grade sheet needs them.
    </div>
  ) : null;

  const workbook = (
    <div className="card">
      <h3>1. The workbook</h3>
      <p style={{ marginTop: 0 }}>
        Scores, Booth Scores, Results, Leaderboard, Individual Grades, and the For Encoding grade sheet.{' '}
        {closed ? '' : 'Before the event is closed it shows the scores as they are now, and can still change.'}
      </p>
      {sectionNote}
      <div className="actions">
        <a className="btn secondary" href={`/api/admin/events/${id}/export`}>
          Download the workbook
        </a>
      </div>
    </div>
  );

  const nobody = recipients.nobody.length ? (
    <>
      <p className="sub">These people will get no email:</p>
      <ul className="list">
        {recipients.nobody.map((t) => (
          <li key={t}>
            <span className="pill err">No email</span>
            <span className="grow-1" style={{ overflowWrap: 'anywhere' }}>
              {t}
            </span>
          </li>
        ))}
      </ul>
    </>
  ) : null;

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="close" title="Close the event" />
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          Closing locks judging: judges can no longer change scores, and results and grades are final. It hands over two files: the <b>workbook</b> for the department and the{' '}
          <b>email file</b> for Microsoft Power Automate to send each student and adviser their results. You can undo closing until you download the email file.
        </p>

        {!closed ? (
          <>
            <div className="section-title">Before closing</div>
            <p className="sub" style={{ marginTop: 0 }}>
              The event can close when every group is fully judged in both halves and every group member has individual scores. For a group that cannot be, record a reason;
              a member who missed the defense can be marked absent.
            </p>
            {checks.blockers.length ? (
              <div className="notice err">{itemsNeedYou(checks.blockers.length)} you before the event can close.</div>
            ) : (
              <div className="notice ok">Nothing is in the way of closing the event.</div>
            )}
          </>
        ) : checks.blockers.length && !sent ? (
          <div className="notice err">Something changed after the event closed: {itemsNeedYou(checks.blockers.length)} you before you send results.</div>
        ) : null}
        {checks.blockers.length && !sent ? (
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
        ) : null}
        {checks.warnings.length && !sent ? (
          <>
            <p className="sub">Worth a look, but these do not stop the event from closing:</p>
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

        {!closed ? (
          <>
            {nobody}
            <form action={closeEvent} className="card form" style={{ marginTop: 14 }}>
              {hidden({ eventId: id })}
              <p style={{ margin: 0 }}>
                Closing locks every judge’s scores. A blank score is never counted as zero. You can still correct a score with a reason, and undo closing, until you download
                the email file.
              </p>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="checkbox" name="confirm" value="yes" style={{ width: 22, height: 22 }} /> I have checked the progress
              </label>
              <button className="btn gold" type="submit" disabled={checks.blockers.length > 0}>
                Close the event
              </button>
            </form>
            <div className="section-title">Preview</div>
            {workbook}
          </>
        ) : (
          <>
            <div className="notice ok">
              The event was closed{event.finalised_at ? ` on ${when(event.finalised_at)}` : ''}.{' '}
              {sent ? `The email file was first downloaded on ${when(event.released_at!)}, so nothing can change now.` : 'Judges can no longer change scores.'}
            </div>
            <div className="section-title">The two files</div>
            {workbook}
            <div className="card">
              <h3>2. The email file</h3>
              <p style={{ marginTop: 0 }}>
                One row per person, with <b>Email</b>, <b>Name</b> and <b>Message</b>, ready for Power Automate: {recipients.students.length} student
                {recipients.students.length === 1 ? '' : 's'}, each told their letter grade and their group’s percentage and never a rank; then {recipients.advisers.length} adviser
                {recipients.advisers.length === 1 ? '' : 's'}, one row each however many groups they hold, listing each group’s percentage and which placed in the top 10.
              </p>
              {nobody}
              {!sent ? (
                <div className="notice warn">
                  <b>Downloading the email file is final.</b> After it, closing cannot be undone and no score, absence, student or group can change, because the emails would
                  no longer match. Download the workbook and check it first.
                </div>
              ) : null}
              <form method="post" action={`/api/admin/events/${id}/emails`} className="form">
                {!sent ? (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input type="checkbox" name="confirm" value="yes" style={{ width: 22, height: 22, flex: '0 0 auto' }} /> Results are final and ready to send
                  </label>
                ) : null}
                <button className={`btn ${sent ? 'secondary' : 'gold'}`} type="submit" disabled={checks.blockers.length > 0 && !sent}>
                  {sent ? 'Download the email file again' : 'Download the email file'}
                </button>
                {!sent ? <span className="sub">When the download has started, reload this page.</span> : null}
              </form>
            </div>
            {!sent ? (
              <details className="inline-form" style={{ marginTop: 16 }}>
                <summary>Undo closing…</summary>
                <form action={undoClose} className="form">
                  {hidden({ eventId: id })}
                  <div className="notice warn" style={{ marginTop: 0 }}>
                    Judges will be able to change scores again, and a workbook you have already downloaded may no longer match. Close the event again when judging is done.
                  </div>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input type="checkbox" name="confirm" value="yes" style={{ width: 22, height: 22, flex: '0 0 auto' }} /> Reopen judging
                  </label>
                  <button className="btn small danger" type="submit">
                    Undo closing
                  </button>
                </form>
              </details>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}

import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { linkState, LINK_DAYS, MAX_TRIES } from '@/lib/link-rules';
import { appBaseUrl, linkStatus, releaseRecipients } from '@/lib/links';
import { getEvent } from '@/lib/repo';
import { unlockLink } from '../../../actions';

export const dynamic = 'force-dynamic';

const when = (d: Date | null) => (d ? new Date(d).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '');

export default async function ReleasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [{ recipients, problems }, links] = await Promise.all([releaseRecipients(id), linkStatus(id)]);
  const base = appBaseUrl();
  const live = new Set(links.map((l) => `${l.recipient_type}:${l.recipient_id}`));
  const withoutLink = recipients.filter((r) => !live.has(`${r.type}:${r.id}`));
  const states = links.map((l) => linkState(l));
  const students = recipients.filter((r) => r.type === 'student').length;
  const advisers = recipients.length - students;
  const post = `/api/admin/events/${id}/mailing`;

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="release" title="Release results" />
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          Releasing gives every student and adviser a private link to their own results. The app never sends email: it gives you a <b>mailing sheet</b> (name, email and link)
          to send with Microsoft Power Automate.
        </p>
        <ul className="sub" style={{ paddingLeft: 18, marginTop: 0 }}>
          <li>A student sees their own letter grade, their own scores and their group’s percentages. No ranks.</li>
          <li>An adviser sees only their own groups’ results and their own position in the adviser ranking. No student grades.</li>
          <li>
            The link shows nothing until the person types their student number, or the adviser code you gave them. {MAX_TRIES} wrong tries lock it. Links stay open for{' '}
            {LINK_DAYS} days and can be opened any number of times.
          </li>
        </ul>
        <p className="sub">
          Links start with <b style={{ overflowWrap: 'anywhere' }}>{base}/r/</b>
        </p>
        {base.startsWith('http://localhost') && process.env.NODE_ENV === 'production' ? (
          <div className="notice err">The app does not know its own web address, so links would not work. A developer sets APP_URL in Vercel (see README).</div>
        ) : null}

        {problems.length ? (
          <>
            <div className="section-title">Check before sending</div>
            <ul className="list">
              {problems.map((p) => (
                <li key={p}>
                  <span className="pill part">Check</span>
                  <span className="grow-1" style={{ overflowWrap: 'anywhere' }}>
                    {p}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {event.status !== 'finalised' ? (
          <div className="notice warn">Close judging on the Progress tab first. Results can be released only after judging is closed.</div>
        ) : !event.released_at ? (
          <form method="post" action={post} className="card form">
            <input type="hidden" name="mode" value="release" />
            <h3>Release results</h3>
            <p style={{ margin: 0 }}>
              {students} student{students === 1 ? '' : 's'} and {advisers} adviser{advisers === 1 ? '' : 's'} will get a link. After release, scores can no longer be corrected and
              judging cannot be reopened.
            </p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="checkbox" name="confirm" value="yes" style={{ width: 22, height: 22, flex: '0 0 auto' }} /> Results are final and ready for students and advisers
            </label>
            <button className="btn gold" type="submit">
              Release results and download the mailing sheet
            </button>
            <p className="sub" style={{ margin: 0 }}>
              Save the file to OneDrive straight away: the links in it cannot be shown again. When the download has started, reload this page.
            </p>
          </form>
        ) : (
          <>
            <div className="notice ok">Results were released on {when(event.released_at)}.</div>
            <div className="grid">
              <div className="tile">
                <b>Links in use</b>
                <div className="stat">{links.length}</div>
                <div className="sub">{links.filter((l) => l.first_opened_at).length} opened at least once</div>
              </div>
              <div className="tile">
                <b>Locked</b>
                <div className="stat">{states.filter((s) => s === 'locked').length}</div>
                <div className="sub">After {MAX_TRIES} wrong tries</div>
              </div>
              <div className="tile">
                <b>Expired</b>
                <div className="stat">{states.filter((s) => s === 'expired').length}</div>
                <div className="sub">Reissue to open for another {LINK_DAYS} days</div>
              </div>
            </div>

            <div className="section-title">New links</div>
            <form method="post" action={post} className="actions" style={{ marginTop: 0 }}>
              <input type="hidden" name="mode" value="missing" />
              <button className="btn secondary" type="submit" disabled={!withoutLink.length}>
                Download links for the {withoutLink.length} {withoutLink.length === 1 ? 'person' : 'people'} with none yet
              </button>
            </form>
            <p className="sub">For example an adviser whose code you added after release. Their rows are the only ones in that mailing sheet.</p>

            <div className="section-title">Link status</div>
            <p className="sub" style={{ marginTop: 0 }}>
              <b>Reissue</b> makes a new link for one person and downloads a mailing sheet with just their row; their old link stops working. <b>Unlock</b> lets a locked link be
              tried again.
            </p>
            <ul className="list">
              {links.map((l, i) => {
                const st = states[i];
                return (
                  <li key={l.id} style={{ flexWrap: 'wrap' }}>
                    <span className="grow-1" style={{ minWidth: 200 }}>
                      <span className="title">{l.name}</span>
                      <span className="sub" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                        {l.recipient_type === 'student' ? 'Student' : 'Adviser'} · {l.email} · open until {when(l.expires_at)}
                      </span>
                      <span className="sub" style={{ display: 'block' }}>
                        {l.first_opened_at ? `Opened ${l.open_count} time${l.open_count === 1 ? '' : 's'}, last ${when(l.last_opened_at)}` : 'Not opened yet'}
                        {l.failed_attempts && st === 'ok' ? ` · ${l.failed_attempts} wrong ${l.failed_attempts === 1 ? 'try' : 'tries'}` : ''}
                      </span>
                    </span>
                    <span className={`pill ${st === 'ok' ? (l.first_opened_at ? 'done' : 'none') : st === 'locked' ? 'err' : 'part'}`}>
                      {st === 'ok' ? (l.first_opened_at ? 'Opened' : 'Sent') : st === 'locked' ? 'Locked' : 'Expired'}
                    </span>
                    {st === 'locked' ? (
                      <form action={unlockLink}>
                        <input type="hidden" name="eventId" value={id} />
                        <input type="hidden" name="linkId" value={l.id} />
                        <button className="btn small secondary" type="submit">
                          Unlock
                        </button>
                      </form>
                    ) : null}
                    <form method="post" action={post}>
                      <input type="hidden" name="mode" value="one" />
                      <input type="hidden" name="recipient" value={`${l.recipient_type}:${l.recipient_id}`} />
                      <button className="btn small secondary" type="submit">
                        Reissue
                      </button>
                    </form>
                  </li>
                );
              })}
              {!links.length ? <li className="sub">No links in use.</li> : null}
            </ul>

            <details className="inline-form" style={{ marginTop: 16 }}>
              <summary>Reissue every link…</summary>
              <form method="post" action={post} className="form">
                <input type="hidden" name="mode" value="all" />
                <p style={{ margin: 0 }}>Use this only if the mailing sheet was lost or shared by mistake. Every link already sent stops working, and everyone needs a new email.</p>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="checkbox" name="confirm" value="yes" style={{ width: 22, height: 22, flex: '0 0 auto' }} /> Stop every earlier link
                </label>
                <button className="btn small danger" type="submit">
                  Reissue every link and download a new mailing sheet
                </button>
              </form>
            </details>
          </>
        )}
      </main>
    </>
  );
}

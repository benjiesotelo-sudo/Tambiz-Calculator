import Link from 'next/link';
import { AppBar, Notice } from '@/components/AppBar';
import { EmptyState } from '@/components/EmptyState';
import { statusLabel } from '@/components/EventNav';
import { SubmitButton } from '@/components/SubmitButton';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import { listEvents } from '@/lib/repo';
import { isSeedEvent, PRACTICE_TITLE, sampleEventSize, type EventSize } from '@/lib/seed';
import { createEvent, replaceSampleData } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const sp = await searchParams;
  const events = await listEvents();
  // An event made from the sample data of an older version, not yet marked practice, can be replaced with the practice event.
  const replaceable = (await Promise.all(events.filter((e) => isSeedEvent(e.id) && !e.practice).map((e) => sampleEventSize({ query }, e.id)))).filter(
    (x): x is EventSize => x !== null,
  );
  const nextYear = (events[0]?.year ?? new Date().getFullYear()) + 1;
  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <div className="eyebrow">Coordinator</div>
        <h1 className="page-title">Events</h1>
        <p className="lead">Each year’s Tambiz is one event. Its students, groups, judges and scores all belong to it. A practice event is for trying the app out.</p>
        <Notice ok={sp.ok} error={sp.error} />
        {events.length ? (
          <ul className="list">
            {events.map((e) => (
              <li key={e.id} style={{ flexWrap: 'wrap' }}>
                <Link className="rowlink" href={`/admin/events/${e.id}`}>
                  <span className="grow-1">
                    <span className="title">{e.title}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {e.year}
                      {e.practice ? ' · Practice: invented data, not a real event' : ''}
                    </span>
                  </span>
                  {e.practice ? <span className="pill part">Practice</span> : null}
                  <span className={`pill ${e.status === 'finalised' ? 'done' : 'none'}`}>{statusLabel(e)}</span>
                </Link>
                {replaceable.some((r) => r.id === e.id) ? <ReplaceSample size={replaceable.find((r) => r.id === e.id)!} /> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {!events.length ? (
          <EmptyState icon="compass" title="No events yet" action={<a className="btn secondary" href="#year">Start the first event</a>}>
            Each year’s Tambiz is one event. Create the first one below, then upload its workbook.
          </EmptyState>
        ) : null}

        <div className="section-title">Start a new event</div>
        <form action={createEvent} className="card form">
          <div className="row2">
            <div className="field">
              <label htmlFor="year">Year</label>
              <input className="input" id="year" name="year" inputMode="numeric" defaultValue={nextYear} required />
            </div>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input className="input" id="title" name="title" placeholder={`Tambiz ${nextYear}`} />
            </div>
          </div>
          <span className="sub">The scoring sheet is copied from the newest event, so this year’s maximums carry over.</span>
          <SubmitButton busy="Creating the event…">Create event</SubmitButton>
        </form>
      </main>
    </>
  );
}

function ReplaceSample({ size }: { size: EventSize }) {
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;
  return (
    <details className="inline-form" style={{ margin: '8px 0 16px', flex: '1 1 100%' }}>
      <summary>
        <span className="pill none">Sample data</span> Replace with fresh practice data…
      </summary>
      <form action={replaceSampleData} className="form">
        <input type="hidden" name="eventId" value={size.id} />
        <div className="notice warn" style={{ marginTop: 0 }}>
          This removes <b>{size.title}</b> and everything in it: {n(size.students, 'student')}, {n(size.groups, 'group')} and {n(size.sheets, 'score sheet')} from the judges. In its
          place comes the practice event, {PRACTICE_TITLE}, with invented data. Events you created are never touched, and no password changes.
        </div>
        <label className="check">
          <input type="checkbox" name="confirm" value="yes" /> Remove {size.title} and its scores
        </label>
        <SubmitButton className="btn small danger" busy="Replacing…">
          Replace with fresh practice data
        </SubmitButton>
      </form>
    </details>
  );
}

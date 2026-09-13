import Link from 'next/link';
import { AppBar, Notice } from '@/components/AppBar';
import { STATUS_LABEL } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { listEvents } from '@/lib/repo';
import { createEvent } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const sp = await searchParams;
  const events = await listEvents();
  const nextYear = (events[0]?.year ?? new Date().getFullYear()) + 1;
  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <div className="eyebrow">Coordinator</div>
        <h1 className="page-title">Events</h1>
        <p className="lead">Each year’s Tambiz is one event. Groups, judges, scores and the scoring sheet all belong to it.</p>
        <Notice ok={sp.ok} error={sp.error} />
        <ul className="list">
          {events.map((e) => (
            <li key={e.id}>
              <Link className="rowlink" href={`/admin/events/${e.id}`}>
                <span className="grow-1">
                  <span className="title">{e.title}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {e.year}
                  </span>
                </span>
                <span className={`pill ${e.status === 'judging' ? 'part' : e.status === 'finalised' ? 'done' : 'none'}`}>{STATUS_LABEL[e.status]}</span>
              </Link>
            </li>
          ))}
          {!events.length ? <li className="sub">No events yet. Create the first one below.</li> : null}
        </ul>

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
          <button className="btn" type="submit">
            Create event
          </button>
        </form>
      </main>
    </>
  );
}

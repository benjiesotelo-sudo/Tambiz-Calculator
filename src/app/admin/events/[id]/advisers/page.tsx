import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { getEvent, listAdvisers } from '@/lib/repo';
import { addAdviser, importAdvisers } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function AdvisersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const advisers = await listAdvisers(id);

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="advisers" title="Advisers" />
        <Notice ok={sp.ok} error={sp.error} />

        <form action={importAdvisers} className="card form">
          <h3>Import the adviser list</h3>
          <input type="hidden" name="eventId" value={id} />
          <p className="sub" style={{ margin: 0 }}>
            An Excel file (.xlsx) with an <b>Adviser</b> column. Add <b>Email</b> if you have it, and a <b>Group Code</b> or <b>Group Name</b> column to set each group’s adviser in
            one go. Importing again updates, it never duplicates.
          </p>
          <input className="input" type="file" name="file" accept=".xlsx" required />
          <button className="btn" type="submit">
            Import
          </button>
        </form>

        <div className="section-title">Advisers ({advisers.length})</div>
        <ul className="list">
          {advisers.map((a) => (
            <li key={a.id}>
              <span className="grow-1">
                <span className="title">{a.name}</span>
                <span className="sub" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {a.email || 'No email'}
                </span>
              </span>
              <span className={`pill ${a.group_count ? 'done' : 'none'}`}>
                {a.group_count} group{a.group_count === 1 ? '' : 's'}
              </span>
            </li>
          ))}
          {!advisers.length ? <li className="sub">No advisers yet.</li> : null}
        </ul>

        <div className="section-title">Add one adviser by hand</div>
        <form action={addAdviser} className="card form">
          <input type="hidden" name="eventId" value={id} />
          <div className="row2">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input className="input" id="name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" />
            </div>
          </div>
          <button className="btn" type="submit">
            Save adviser
          </button>
        </form>
      </main>
    </>
  );
}

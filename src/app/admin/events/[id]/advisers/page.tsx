import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { getEvent, listAdvisers } from '@/lib/repo';
import { addAdviser, importAdvisers, makeAdviserCodes, setAdviserCode } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function AdvisersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const advisers = await listAdvisers(id);
  const withoutCode = advisers.filter((a) => !a.link_code).length;

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="advisers" title="Advisers" />
        <Notice ok={sp.ok} error={sp.error} />
        {event.released_at ? (
          <div className="notice warn">
            Results have been released. An import can still change which adviser a group has. If it does, both advisers’ result pages and the adviser ranking change, and the
            mailing sheet already sent no longer matches. Each change is recorded on the group’s page.
          </div>
        ) : null}

        <form action={importAdvisers} className="card form">
          <h3>Import the adviser list</h3>
          <input type="hidden" name="eventId" value={id} />
          <p className="sub" style={{ margin: 0 }}>
            An Excel file (.xlsx) with an <b>Adviser</b> column. Add <b>Email</b> if you have it, a <b>Group Code</b> or <b>Group Name</b> column to set each group’s adviser in
            one go, and an <b>Adviser Code</b> column if you have already chosen codes. Importing again updates, it never duplicates.
          </p>
          <input className="input" type="file" name="file" accept=".xlsx" required />
          <button className="btn" type="submit">
            Import
          </button>
        </form>

        <div className="section-title">Advisers ({advisers.length})</div>
        <p className="sub" style={{ marginTop: 0 }}>
          Each adviser types their <b>adviser code</b> to open their private results link. Hand each adviser their code yourself, for example at a faculty meeting; it is never in
          the email. An adviser without a code gets no link.
        </p>
        {advisers.length ? (
          <form action={makeAdviserCodes} className="actions" style={{ marginTop: 0, marginBottom: 8 }}>
            <input type="hidden" name="eventId" value={id} />
            <button className="btn small secondary" type="submit" disabled={!withoutCode}>
              Make codes for the {withoutCode} adviser{withoutCode === 1 ? '' : 's'} without one
            </button>
          </form>
        ) : null}
        <ul className="list">
          {advisers.map((a) => (
            <li key={a.id} style={{ flexWrap: 'wrap' }}>
              <span className="grow-1" style={{ minWidth: 180 }}>
                <span className="title">{a.name}</span>
                <span className="sub" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {a.email || 'No email'} · {a.link_code ? <>Code <span className="secret">{a.link_code}</span></> : 'No code yet'}
                </span>
              </span>
              <span className={`pill ${a.group_count ? 'done' : 'none'}`}>
                {a.group_count} group{a.group_count === 1 ? '' : 's'}
              </span>
              <details className="inline-form" style={{ flexBasis: '100%' }}>
                <summary>{a.link_code ? 'Change code…' : 'Set code…'}</summary>
                <form action={setAdviserCode} className="form">
                  <input type="hidden" name="eventId" value={id} />
                  <input type="hidden" name="adviserId" value={a.id} />
                  <label className="field">
                    <span className="label-text">Adviser code (leave empty to remove)</span>
                    <input className="input" name="code" defaultValue={a.link_code} autoCapitalize="characters" autoComplete="off" maxLength={20} style={{ maxWidth: 200 }} />
                  </label>
                  <button className="btn small" type="submit">
                    Save code
                  </button>
                </form>
              </details>
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

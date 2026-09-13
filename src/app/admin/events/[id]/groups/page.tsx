import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { getEvent, listAdvisers, listGroups } from '@/lib/repo';
import { saveGroup } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function GroupsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [groups, advisers] = await Promise.all([listGroups(id), listAdvisers(id)]);
  const nextCode = `G${String(groups.length + 1).padStart(2, '0')}`;

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="groups" title="Groups" />
        <Notice ok={sp.ok} error={sp.error} />
        <ul className="list">
          {groups.map((g) => (
            <li key={g.id}>
              <Link className="rowlink" href={`/admin/events/${id}/groups/${g.id}`}>
                <span className="code">{g.code}</span>
                <span className="grow-1">
                  <span className="title">{g.name}</span>
                  <span className="sub" style={{ display: 'block' }}>
                    {g.section || 'No section'} · {g.adviser_name ?? 'No adviser'}
                  </span>
                </span>
                <span className={`pill ${g.member_count ? 'done' : 'err'}`}>
                  {g.member_count} member{g.member_count === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
          {!groups.length ? <li className="sub">No groups yet. Add the first one below.</li> : null}
        </ul>

        <div className="section-title">Add a group</div>
        <form action={saveGroup} className="card form">
          <input type="hidden" name="eventId" value={id} />
          <div className="row2">
            <div className="field">
              <label htmlFor="code">Code</label>
              <input className="input" id="code" name="code" defaultValue={nextCode} required />
            </div>
            <div className="field">
              <label htmlFor="section">Section</label>
              <input className="input" id="section" name="section" placeholder="BA-3A" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="name">Business name</label>
            <input className="input" id="name" name="name" placeholder="Kape Kultura" required />
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="adviserId">Adviser</label>
              <select className="input" id="adviserId" name="adviserId" defaultValue="">
                <option value="">Choose from the adviser list</option>
                {advisers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="adviserName">…or type a new adviser</label>
              <input className="input" id="adviserName" name="adviserName" placeholder="Prof. Juan Dela Cruz" />
            </div>
          </div>
          <button className="btn" type="submit">
            Add group
          </button>
        </form>
      </main>
    </>
  );
}

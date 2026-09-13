import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { requireAdmin } from '@/lib/auth';
import { getEvent, getGroup, groupMembers, listAdvisers, listStudents, rollName } from '@/lib/repo';
import { addMembers, deleteGroup, removeMember, saveGroup } from '../../../../actions';

export const dynamic = 'force-dynamic';

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; gid: string }>;
  searchParams: Promise<{ ok?: string; error?: string; q?: string; all?: string }>;
}) {
  const acc = await requireAdmin();
  const { id, gid } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const group = await getGroup(id, gid);
  if (!group) notFound();
  const [members, advisers, students] = await Promise.all([groupMembers(gid), listAdvisers(id), listStudents(id)]);

  // Students not in any group; same section first unless "all sections" is chosen. A search looks at everyone unplaced.
  const q = (sp.q ?? '').trim().toLowerCase();
  const unplaced = students.filter((s) => !s.group_id);
  const candidates = unplaced.filter((s) =>
    q ? `${s.surname} ${s.first_name} ${s.student_number} ${s.section}`.toLowerCase().includes(q) : sp.all || !group.section ? true : s.section === group.section,
  );
  const base = `/admin/events/${id}/groups/${gid}`;

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <div className="crumbs">
          <Link href={`/admin/events/${id}/groups`}>‹ Groups</Link>
        </div>
        <div className="eyebrow">
          {event.title} · {group.code}
        </div>
        <h1 className="page-title">{group.name}</h1>
        <p className="lead">
          {group.section || 'No section'} · {group.adviser_name ?? 'No adviser'}
        </p>
        <Notice ok={sp.ok} error={sp.error} />

        <div className="section-title">Members ({members.length})</div>
        <ul className="list">
          {members.map((m) => (
            <li key={m.id}>
              <span className="grow-1">
                <span className="title">{rollName(m)}</span>
                <span className="sub" style={{ display: 'block' }}>
                  {m.student_number} · {m.section}
                </span>
              </span>
              <form action={removeMember}>
                <input type="hidden" name="eventId" value={id} />
                <input type="hidden" name="groupId" value={gid} />
                <input type="hidden" name="studentId" value={m.id} />
                <button className="btn small danger" type="submit">
                  Remove
                </button>
              </form>
            </li>
          ))}
          {!members.length ? <li className="sub">No members yet. Tick students below and press Add.</li> : null}
        </ul>

        <div className="section-title">Add members from the class roll</div>
        <form method="get" className="actions" style={{ marginTop: 0 }}>
          <input className="input" name="q" defaultValue={sp.q ?? ''} placeholder="Search name or student number" style={{ flex: '1 1 200px', width: 'auto' }} />
          <button className="btn secondary" type="submit">
            Search
          </button>
          {group.section && !sp.all && !q ? (
            <Link className="btn secondary" href={`${base}?all=1`}>
              All sections
            </Link>
          ) : null}
        </form>
        <p className="sub">
          Showing {candidates.length} student{candidates.length === 1 ? '' : 's'} not yet in any group
          {q ? ` matching “${sp.q}”` : sp.all || !group.section ? '' : ` in ${group.section}`}. A student can belong to only one group.
        </p>
        {students.length === 0 ? (
          <div className="notice warn">
            The class roll is empty. <Link href={`/admin/events/${id}/roll`}>Import the class roll</Link> first; members are chosen from it, never typed.
          </div>
        ) : (
          <form action={addMembers}>
            <input type="hidden" name="eventId" value={id} />
            <input type="hidden" name="groupId" value={gid} />
            <ul className="list">
              {candidates.slice(0, 80).map((s) => (
                <li key={s.id}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0, cursor: 'pointer' }}>
                    <input type="checkbox" name="studentId" value={s.id} style={{ width: 22, height: 22, flex: '0 0 auto' }} />
                    <span className="grow-1">
                      <span className="title">{rollName(s)}</span>
                      <span className="sub" style={{ display: 'block' }}>
                        {s.student_number} · {s.section}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              {!candidates.length ? <li className="sub">Nobody to add here.</li> : null}
            </ul>
            {candidates.length ? (
              <div className="actions">
                <button className="btn" type="submit">
                  Add ticked students
                </button>
              </div>
            ) : null}
          </form>
        )}

        <div className="section-title">Group details</div>
        <form action={saveGroup} className="card form">
          <input type="hidden" name="eventId" value={id} />
          <input type="hidden" name="groupId" value={gid} />
          <div className="row2">
            <div className="field">
              <label htmlFor="code">Code</label>
              <input className="input" id="code" name="code" defaultValue={group.code} required />
            </div>
            <div className="field">
              <label htmlFor="section">Section</label>
              <input className="input" id="section" name="section" defaultValue={group.section} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="name">Business name</label>
            <input className="input" id="name" name="name" defaultValue={group.name} required />
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="adviserId">Adviser</label>
              <select className="input" id="adviserId" name="adviserId" defaultValue={group.adviser_id ?? ''}>
                <option value="">No adviser</option>
                {advisers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="adviserName">…or type a new adviser</label>
              <input className="input" id="adviserName" name="adviserName" />
            </div>
          </div>
          <button className="btn" type="submit">
            Save group
          </button>
        </form>
        <form action={deleteGroup} className="actions">
          <input type="hidden" name="eventId" value={id} />
          <input type="hidden" name="groupId" value={gid} />
          <button className="btn small danger" type="submit">
            Delete this group
          </button>
          <span className="sub">Only possible before any judge has scored it.</span>
        </form>
      </main>
    </>
  );
}

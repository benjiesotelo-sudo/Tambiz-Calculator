import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { requireAdmin } from '@/lib/auth';
import { getEvent, getGroup, groupDetailChanges, groupMembers, listAdvisers, listStudents, rollName } from '@/lib/repo';
import { addMembers, deleteGroup, removeMember, saveGroup, setMemberAbsent } from '../../../../actions';

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
  const [members, advisers, students, changes] = await Promise.all([groupMembers(gid), listAdvisers(id), listStudents(id), groupDetailChanges(id, gid)]);
  const released = !!event.released_at;

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

        <div className="section-title">Scores</div>
        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn small secondary" href={`${base}/scores?half=defense`}>
            Defense scores and corrections
          </Link>
          <Link className="btn small secondary" href={`${base}/scores?half=booth`}>
            Booth scores and corrections
          </Link>
        </div>

        <div className="section-title">Members ({members.length})</div>
        <ul className="list">
          {members.map((m) => (
            <li key={m.id} style={{ flexWrap: 'wrap' }}>
              <span className="grow-1" style={{ minWidth: 180 }}>
                <span className="title">{rollName(m)}</span>
                <span className="sub" style={{ display: 'block' }}>
                  {m.student_number} · {m.section}
                  {m.absent_at ? ' · Absent from the defense: no grade from the app; you enter it' : ''}
                </span>
              </span>
              {m.absent_at ? <span className="pill part">Absent</span> : null}
              <form action={setMemberAbsent}>
                <input type="hidden" name="eventId" value={id} />
                <input type="hidden" name="groupId" value={gid} />
                <input type="hidden" name="studentId" value={m.id} />
                <input type="hidden" name="absent" value={m.absent_at ? 'no' : 'yes'} />
                <input type="hidden" name="return" value={base} />
                <button className="btn small secondary" type="submit" disabled={!!event.released_at}>
                  {m.absent_at ? 'Not absent' : 'Mark absent'}
                </button>
              </form>
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
        {released ? (
          <div className="notice warn">
            Results have been released. You can still correct the code, name or adviser, and each change is recorded below with your name and the time. A new code or name
            shows on the members’ and adviser’s result pages. A new adviser changes both advisers’ result pages and the adviser ranking, and the mailing sheet already sent no
            longer matches.
          </div>
        ) : null}
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
              <input className="input" id="section" name="section" defaultValue={group.section} readOnly={released} />
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
          <button className="btn small danger" type="submit" disabled={released}>
            Delete this group
          </button>
          <span className="sub">{released ? 'Not possible after results are released.' : 'Only possible before any judge has scored it.'}</span>
        </form>

        {changes.length ? (
          <>
            <div className="section-title">Changes to this group’s details</div>
            <ul className="list">
              {changes.map((c, i) => (
                <li key={i} style={{ display: 'block' }}>
                  <div className="title">{c.detail.changes.join('; ')}</div>
                  <div className="sub">
                    {c.who ?? 'Coordinator'}, {new Date(c.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
                    {c.detail.file ? `, from the adviser import ${c.detail.file}` : ''}
                    {c.detail.released ? '. After results were released.' : '.'}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </main>
    </>
  );
}

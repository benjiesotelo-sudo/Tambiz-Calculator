import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { requireAdmin } from '@/lib/auth';
import type { GridColumn } from '@/lib/grid';
import { getEvent, getGroup, groupDetailChanges, groupMembers, listStudents, rollName } from '@/lib/repo';
import { memberGridRow, PRESENCE } from '@/lib/tables';
import { deleteGroup } from '../../../../actions';
import { removeMembersTable, saveMembersTable } from '../../../../table-actions';

export const dynamic = 'force-dynamic';

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string; gid: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id, gid } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const group = await getGroup(id, gid);
  if (!group) notFound();
  const [members, students, changes] = await Promise.all([groupMembers(gid), listStudents(id), groupDetailChanges(id, gid)]);
  const released = !!event.released_at;
  const base = `/admin/events/${id}/groups/${gid}`;

  // Students in no group, this group's section first, offered while typing in the blank row.
  const unplaced = students.filter((s) => !s.group_id).sort((a, b) => Number(b.section === group.section) - Number(a.section === group.section));
  const sameSection = unplaced.filter((s) => s.section === group.section).length;
  const columns: GridColumn[] = [
    {
      key: 'student',
      label: 'Student No.',
      type: 'choice',
      editable: true,
      addOnly: true,
      required: true,
      allowNew: true,
      uniqueOptions: true,
      options: unplaced.map((s) => ({ value: s.id, label: s.student_number, hint: `${rollName(s)} · ${s.section}` })),
      width: '9.5rem',
    },
    { key: 'name', label: 'Name (per class roll)', width: 'minmax(11rem, 2fr)' },
    { key: 'section', label: 'Section', width: '6.5rem' },
    { key: 'email', label: 'Email', width: 'minmax(10rem, 1.6fr)' },
    { key: 'absent', label: 'At the defense', type: 'choice', editable: true, options: PRESENCE, filter: true, width: '8.5rem' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page wide">
        <div className="crumbs">
          <Link href={`/admin/events/${id}/groups`}>‹ Groups</Link>
        </div>
        <div className="eyebrow">
          {event.title} · {group.code}
        </div>
        <h1 className="page-title">{group.name}</h1>
        <p className="lead">
          {group.section || 'No section'} · {group.adviser_name ?? 'No adviser'} · change these on the <Link href={`/admin/events/${id}/groups`}>Groups</Link> table.
        </p>
        <Notice ok={sp.ok} error={sp.error} />

        <div className="actions" style={{ marginTop: 0 }}>
          <Link className="btn small secondary" href={`${base}/scores?half=defense`}>
            Defense scores and corrections
          </Link>
          <Link className="btn small secondary" href={`${base}/scores?half=booth`}>
            Booth scores and corrections
          </Link>
        </div>

        <div className="section-title">Members</div>
        {students.length === 0 ? (
          <div className="notice warn">
            The class roll is empty. <Link href={`/admin/events/${id}/roll`}>Import the class roll</Link> first; members are chosen from it, never typed.
          </div>
        ) : (
          <p className="sub" style={{ marginTop: 0 }}>
            To add a member, type their student number or part of their name in the last row and pick them; paste a column of student numbers to add several at once.{' '}
            {unplaced.length} student{unplaced.length === 1 ? ' is' : 's are'} in no group yet
            {group.section ? `, ${sameSection} of them in ${group.section}` : ''}. A student can belong to only one group. Mark a student <b>Absent</b> if they missed the
            defense: the app then gives them no grade, and you enter it yourself.
          </p>
        )}
        <DataGrid
          label={`Members of ${group.name}`}
          columns={columns}
          rows={members.map((m) => memberGridRow(event, m))}
          save={saveMembersTable.bind(null, id, gid)}
          remove={released ? undefined : removeMembersTable.bind(null, id, gid)}
          removeLabel="Remove from group"
          canAdd={!released && students.length > 0}
          addHint="Type a student number or name"
          rowName="name"
          searchPlaceholder="Search members"
          emptyText="No members yet."
        />

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

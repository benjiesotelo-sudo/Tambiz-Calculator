import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import { getEvent, listStudents, rollName } from '@/lib/repo';
import { importRoll } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function RollPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; show?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [students, imports] = await Promise.all([
    listStudents(id),
    query<{ file_name: string; row_count: number; added: number; updated: number; uploaded_at: Date }>(
      `SELECT file_name, row_count, added, updated, uploaded_at FROM roll_import WHERE event_id = $1 AND kind = 'roll' ORDER BY uploaded_at DESC LIMIT 5`,
      [id],
    ),
  ]);
  const unplaced = students.filter((s) => !s.group_id);
  const showAll = sp.show === 'all';
  const shown = showAll ? students : unplaced;
  const sections = [...new Set(students.map((s) => s.section))];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="roll" title="Class roll" />
        <Notice ok={sp.ok} error={sp.error} />

        <form action={importRoll} className="card form">
          <h3>Import the class roll</h3>
          <input type="hidden" name="eventId" value={id} />
          <p className="sub" style={{ margin: 0 }}>
            Upload the registrar’s Excel export (.xlsx). It needs the columns Student No., Student Email, Surname, First Name and Section; other columns are ignored. Importing the
            same file again updates students, it never adds them twice.
          </p>
          <input className="input" type="file" name="file" accept=".xlsx" required />
          <button className="btn" type="submit">
            Import
          </button>
        </form>
        {imports.length ? (
          <p className="sub">
            Last import: {imports[0].file_name}, {imports[0].row_count} rows ({imports[0].added} new, {imports[0].updated} updated), {new Date(imports[0].uploaded_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.
          </p>
        ) : null}

        <div className="grid" style={{ marginTop: 10 }}>
          <div className="tile">
            <b>On the roll</b>
            <div className="stat">{students.length}</div>
            <div className="sub">{sections.length} section{sections.length === 1 ? '' : 's'}</div>
          </div>
          <div className="tile">
            <b>Not in any group</b>
            <div className="stat" style={{ color: unplaced.length ? 'var(--error)' : undefined }}>
              {unplaced.length}
            </div>
            <div className="sub">{unplaced.length ? 'Place each one in a group, or leave them out if they dropped' : 'Everyone is placed'}</div>
          </div>
        </div>

        <div className="section-title">{showAll ? `Everyone (${students.length})` : `Not in any group (${unplaced.length})`}</div>
        <div className="actions" style={{ marginTop: 0, marginBottom: 8 }}>
          <Link className="btn small secondary" href={`/admin/events/${id}/roll${showAll ? '' : '?show=all'}`}>
            {showAll ? 'Show only students not in a group' : 'Show everyone'}
          </Link>
        </div>
        <ul className="list">
          {shown.map((s) => (
            <li key={s.id}>
              <span className="grow-1">
                <span className="title">{rollName(s)}</span>
                <span className="sub" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {s.student_number} · {s.section} · {s.email}
                </span>
              </span>
              {s.group_id ? (
                <Link className="pill done" href={`/admin/events/${id}/groups/${s.group_id}`}>
                  {s.group_code}
                </Link>
              ) : (
                <span className="pill err">No group</span>
              )}
            </li>
          ))}
          {!shown.length ? <li className="sub">{students.length ? 'Nobody here.' : 'The roll is empty. Import it above.'}</li> : null}
        </ul>
      </main>
    </>
  );
}

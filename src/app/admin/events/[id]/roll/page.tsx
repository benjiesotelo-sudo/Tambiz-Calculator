import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import type { GridColumn } from '@/lib/grid';
import { getEvent, listGroups, listStudents } from '@/lib/repo';
import { rollGridRow } from '@/lib/tables';
import { importRoll } from '../../../actions';
import { saveRollTable } from '../../../table-actions';

export const dynamic = 'force-dynamic';

export default async function RollPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [students, groups, imports] = await Promise.all([
    listStudents(id),
    listGroups(id),
    query<{ file_name: string; row_count: number; added: number; updated: number; uploaded_at: Date }>(
      `SELECT file_name, row_count, added, updated, uploaded_at FROM roll_import WHERE event_id = $1 AND kind = 'roll' ORDER BY uploaded_at DESC LIMIT 1`,
      [id],
    ),
  ]);
  const unplaced = students.filter((s) => !s.group_id && !s.excluded_reason).length;
  const leftOut = students.filter((s) => !s.group_id && s.excluded_reason).length;
  const sections = new Set(students.map((s) => s.section)).size;

  const columns: GridColumn[] = [
    { key: 'student', label: 'Student No.', editable: true, addOnly: true, required: true, width: '8.2rem' },
    { key: 'surname', label: 'Surname', editable: true, required: true, width: 'minmax(6.5rem, 1fr)' },
    { key: 'first', label: 'First name', editable: true, required: true, width: 'minmax(6.5rem, 1fr)' },
    { key: 'middle', label: 'Middle name', editable: true, width: 'minmax(5.5rem, .8fr)' },
    { key: 'section', label: 'Section', editable: true, required: true, filter: true, width: '5.8rem' },
    { key: 'email', label: 'Email', editable: true, required: true, width: 'minmax(9rem, 1.5fr)' },
    {
      key: 'group',
      label: 'Group',
      type: 'choice',
      editable: true,
      options: groups.map((g) => ({ value: g.id, label: g.code, hint: `${g.name} · ${g.section}` })),
      filter: true,
      width: '5.6rem',
    },
    { key: 'status', label: 'Status', filter: true, width: '7.4rem' },
    { key: 'leftout', label: 'Left out because', editable: true, width: 'minmax(8rem, 1.3fr)' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page wide">
        <EventHeader event={event} tab="roll" title="Class roll" />
        <Notice ok={sp.ok} error={sp.error} />

        <form action={importRoll} className="card form">
          <h3>Import the class roll</h3>
          <input type="hidden" name="eventId" value={id} />
          <p className="sub" style={{ margin: 0 }}>
            Upload the registrar’s Excel export (.xlsx). It needs the columns Student No., Student Email, Surname, First Name and Section; other columns are ignored. Importing the
            same file again updates students, it never adds them twice.
            {imports.length
              ? ` Last import: ${imports[0].file_name}, ${imports[0].row_count} rows (${imports[0].added} new, ${imports[0].updated} updated), ${new Date(imports[0].uploaded_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.`
              : ''}
          </p>
          <input className="input" type="file" name="file" accept=".xlsx" required />
          <button className="btn" type="submit">
            Import
          </button>
        </form>

        <p className="lead" style={{ marginTop: 14 }}>
          <b>{students.length}</b> on the roll in {sections} section{sections === 1 ? '' : 's'} ·{' '}
          <b style={{ color: unplaced ? 'var(--error-ink)' : undefined }}>{unplaced}</b> not in any group · <b>{leftOut}</b> left out with a reason.{' '}
          {unplaced ? 'Judging cannot close until every student is in a group or left out.' : ''}
        </p>
        <p className="sub" style={{ marginTop: 0 }}>
          Type a group code in <b>Group</b> to place a student, or change it to move them; empty it to take them out. For a student who dropped, empty their Group and type the
          reason in <b>Left out because</b>. Choose <b>Not in a group</b> under Status to see who is left. A student added by hand in the last row needs a student number, names,
          section and email.
        </p>
        <DataGrid
          label="Class roll"
          columns={columns}
          rows={students.map((s) => rollGridRow(event, s))}
          save={saveRollTable.bind(null, id)}
          addHint="Add a student by hand"
          rowName="surname"
          searchPlaceholder="Search names, student numbers, emails and groups"
          emptyText="The roll is empty. Import it above."
        />
      </main>
    </>
  );
}

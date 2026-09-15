import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import type { GridColumn } from '@/lib/grid';
import { departmentJudges, eventJudges, getEvent } from '@/lib/repo';
import { departmentGridRow, judgeGridRow } from '@/lib/tables';
import { addDepartmentJudgeTable, removeJudgesTable, resetJudgeTable, saveJudgesTable } from '../../../table-actions';

export const dynamic = 'force-dynamic';

export default async function JudgesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [judges, department] = await Promise.all([eventJudges(id), departmentJudges(id)]);

  const columns: GridColumn[] = [
    { key: 'name', label: 'Name as judges see it', editable: true, required: true, width: 'minmax(12rem, 2fr)' },
    { key: 'login', label: 'Email or login', editable: true, required: true, width: 'minmax(12rem, 2fr)' },
    { key: 'profile', label: 'Profile', width: '6.5rem' },
  ];
  const departmentColumns: GridColumn[] = [
    { key: 'name', label: 'Name', width: 'minmax(12rem, 2fr)' },
    { key: 'login', label: 'Email or login', width: 'minmax(12rem, 2fr)' },
    { key: 'events', label: 'Events judged', type: 'number', align: 'right', width: '8rem' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page wide">
        <EventHeader event={event} tab="judges" title="Judges" />
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          The judges of {event.title}. To add a new judge, type their name and email (or a short login) in the last row: the app makes a temporary password and shows it once,
          above the table, to write on their sign-in slip. Typing the login of a judge from an earlier year adds that account instead, with its password unchanged.
        </p>
        <DataGrid
          label="Judges of this event"
          columns={columns}
          rows={judges.map((j) => judgeGridRow(id, j))}
          save={saveJudgesTable.bind(null, id)}
          remove={removeJudgesTable.bind(null, id)}
          removeLabel="Remove from this event"
          actions={[{ label: 'Reset password', run: resetJudgeTable.bind(null, id), confirm: 'Reset the password of {name}? They are signed out everywhere.' }]}
          addHint="Add a judge here"
          rowName="name"
          searchPlaceholder="Search judges"
          emptyText="No judges yet."
        />

        <div className="section-title">Department list</div>
        <p className="sub" style={{ marginTop: 0 }}>
          Judges are kept year after year. Picking the same person again, rather than making a new account, keeps their record together in Judge profiles. Select a judge and
          press <b>Add to this event</b>.
        </p>
        <DataGrid
          label="Department list"
          columns={departmentColumns}
          rows={department.map(departmentGridRow)}
          actions={[{ label: 'Add to this event', run: addDepartmentJudgeTable.bind(null, id) }]}
          rowName="name"
          searchPlaceholder="Search the department list"
          emptyText="Everyone on the department list is already judging this event."
        />
      </main>
    </>
  );
}

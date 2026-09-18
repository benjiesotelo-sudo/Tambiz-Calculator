import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { EmptyState } from '@/components/EmptyState';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import type { GridColumn } from '@/lib/grid';
import { eventJudges, getEvent } from '@/lib/repo';
import { judgeGridRow } from '@/lib/tables';
import { removeJudgesTable, resetJudgeTable, saveJudgesTable } from '../../../table-actions';

export const dynamic = 'force-dynamic';

export default async function JudgesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const judges = await eventJudges(id);

  const columns: GridColumn[] = [
    { key: 'name', label: 'Name as judges see it', editable: true, required: true, width: 'minmax(12rem, 2fr)' },
    { key: 'login', label: 'Email', editable: true, required: true, width: 'minmax(12rem, 2fr)' },
    { key: 'profile', label: 'Profile', width: '6.5rem' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page wide">
        <EventHeader event={event} tab="judges" title="Judges" />
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          The judges of {event.title}. Most come in with the workbook on the Data tab. To add one here, type their name and email in the last row.
        </p>
        <p className="sub" style={{ marginTop: 0 }}>
          <b>Sign-in list.</b> A new judge’s password is shown once, on a list laid out to print on one page and hand out at the briefing. The app keeps no copy of a password
          it can show again, so print the list when it appears: straight after the upload on the Data tab, or here after adding a judge. If a judge loses their slip, select
          them and press <b>Reset password</b>: a new password is shown once in the same way and the old one stops working. Typing the email of a judge from an earlier year adds
          that account instead, with its password unchanged.
        </p>
        {!judges.length ? (
          <EmptyState
            icon="person"
            title="No judges yet"
            action={
              <Link className="btn secondary" href={`/admin/events/${id}/students`}>
                See the Data tab
              </Link>
            }
          >
            They arrive with the workbook, on its second sheet. Or type a judge’s name and email into the table below.
          </EmptyState>
        ) : null}
        <DataGrid
          label="Judges of this event"
          columns={columns}
          rows={judges.map((j) => judgeGridRow(id, j))}
          save={saveJudgesTable.bind(null, id)}
          remove={removeJudgesTable.bind(null, id)}
          removeLabel="Remove from this event"
          actions={[{ label: 'Reset password', run: resetJudgeTable.bind(null, id), confirm: 'Reset the password of {name}? Their old password stops working and they are signed out everywhere.' }]}
          addHint="Add a judge here"
          rowName="name"
          searchPlaceholder="Search judges"
          emptyText="No judges yet. Upload the workbook on the Data tab, or add one here."
          slipsTitle={event.title}
        />
      </main>
    </>
  );
}

import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { EventHeader } from '@/components/EventNav';
import { UploadForm } from '@/components/UploadForm';
import { requireAdmin } from '@/lib/auth';
import { query } from '@/lib/db';
import type { GridColumn } from '@/lib/grid';
import { rosterLock, sentLock } from '@/lib/locks';
import { dataRows, getEvent, listAdvisers, listGroups } from '@/lib/repo';
import { dataGridRow } from '@/lib/tables';
import { uploadWorkbook } from '../../../actions';
import { removeStudentsTable, saveDataTable } from '../../../table-actions';

export const dynamic = 'force-dynamic';

// The Data tab: the one workbook in (upload, template, current data) and one table of every student with their group,
// adviser, section and email.

export default async function DataPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [students, groups, advisers, uploads] = await Promise.all([
    dataRows(id),
    listGroups(id),
    listAdvisers(id),
    query<{ file_name: string; uploaded_at: Date }>(`SELECT file_name, uploaded_at FROM roll_import WHERE event_id = $1 AND kind = 'workbook' ORDER BY uploaded_at DESC LIMIT 1`, [id]),
  ]);
  const advising = advisers.filter((a) => a.group_count > 0);
  const noEmail = advising.filter((a) => !a.email.trim()).length;
  const noSection = students.filter((s) => !s.section.trim()).length;
  const locked = rosterLock(event);

  const columns: GridColumn[] = [
    { key: 'student', label: 'Student No.', editable: true, addOnly: true, required: true, width: '8.2rem' },
    { key: 'surname', label: 'Surname', editable: true, required: true, width: 'minmax(6.5rem, 1fr)' },
    { key: 'first', label: 'First name', editable: true, required: true, width: 'minmax(6.5rem, 1fr)' },
    { key: 'middle', label: 'Middle name', editable: true, width: 'minmax(5.5rem, .8fr)' },
    { key: 'section', label: 'Section', editable: true, filter: true, width: '6rem' },
    { key: 'email', label: 'Email', editable: true, required: true, width: 'minmax(9rem, 1.5fr)' },
    {
      key: 'group',
      label: 'Group',
      type: 'choice',
      editable: true,
      required: true,
      allowNew: true,
      newHint: 'Enter makes “{text}” a new group',
      options: groups.map((g) => ({ value: g.id, label: g.name, hint: g.adviser_name ?? '' })),
      filter: true,
      width: 'minmax(8rem, 1.3fr)',
    },
    {
      key: 'adviser',
      label: 'Adviser',
      type: 'choice',
      editable: true,
      required: true,
      allowNew: true,
      newHint: 'Enter adds “{text}” as a new adviser',
      options: advisers.map((a) => ({ value: a.id, label: a.name, hint: a.email })),
      filter: true,
      width: 'minmax(8rem, 1.3fr)',
    },
    { key: 'adviserEmail', label: 'Adviser email', editable: true, width: 'minmax(9rem, 1.4fr)' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page wide">
        <EventHeader event={event} tab="students" title="Data" />
        <Notice ok={sp.ok} error={sp.error} />

        <div className="card form">
          <h3>One workbook: students and judges</h3>
          <p className="sub" style={{ margin: 0 }}>
            An Excel workbook with two sheets. <b>Students</b>: Student No., Surname, First Name, Middle Name, Section, Email, Group, Adviser and Adviser Email, one row per
            student. <b>Judges</b>: Name, Email and Password, one row per judge. Groups and advisers come from the students’ rows, so every row of one group must name the same
            adviser. Section, Middle Name, Adviser Email and Password may be left empty.
          </p>
          <p className="sub" style={{ margin: 0 }}>
            <b>Why there is an Adviser Email column:</b> each adviser gets their groups’ results in the email file, and this is the only place their address can come from. An
            adviser without one gets no email.
          </p>
          <p className="sub" style={{ margin: 0 }}>
            Uploading adds and updates, matched on the student number, the judge’s email and the group name. It never removes anyone and never changes a score. A judge with an
            empty Password gets one made by the app, shown once below to print; an existing judge keeps their password.
            {uploads.length ? ` Last upload: ${uploads[0].file_name}, ${new Date(uploads[0].uploaded_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.` : ''}
          </p>
          <div className="actions" style={{ marginTop: 0 }}>
            <a className="btn small secondary" href="/api/admin/workbook-template">
              Download template
            </a>
            <a className="btn small secondary" href={`/api/admin/events/${id}/current-data`}>
              Download current data
            </a>
            <span className="sub">Change the current data in Excel and upload it back.</span>
          </div>
          <UploadForm action={uploadWorkbook.bind(null, id)} eventTitle={event.title} disabled={locked ?? undefined} />
        </div>

        <p className="lead" style={{ marginTop: 14 }}>
          <b>{students.length}</b> student{students.length === 1 ? '' : 's'} in <b>{groups.length}</b> group{groups.length === 1 ? '' : 's'} with <b>{advising.length}</b>{' '}
          adviser{advising.length === 1 ? '' : 's'}
          {noEmail ? (
            <>
              {' '}
              · <b style={{ color: 'var(--error-ink)' }}>{noEmail}</b> adviser{noEmail === 1 ? '' : 's'} without an email
            </>
          ) : null}
          {noSection ? (
            <>
              {' '}
              · <b>{noSection}</b> without a section
            </>
          ) : null}
          .
        </p>
        <p className="sub" style={{ marginTop: 0 }}>
          Type into a cell to change it, or paste a block from Excel. <b>Group</b>: pick a group to move a student, or type a new name to start a group. <b>Adviser</b> and{' '}
          <b>Adviser email</b> belong to the group: changing them on one row changes them for every member. Add a student in the last row. To remove a student, select them and
          press <b>Remove student</b>; a student the judges have already scored cannot be removed.
        </p>
        {sentLock(event) ? <div className="notice warn">{sentLock(event)}</div> : locked ? <div className="notice warn">{locked} Names, sections and emails can still be corrected.</div> : null}
        <DataGrid
          label="Students"
          columns={columns}
          rows={students.map((s) => dataGridRow(event, s))}
          save={sentLock(event) ? undefined : saveDataTable.bind(null, id)}
          remove={locked ? undefined : removeStudentsTable.bind(null, id)}
          removeLabel="Remove student"
          canAdd={!locked}
          addHint="Add a student here"
          rowName="surname"
          searchPlaceholder="Search names, student numbers, emails, groups and advisers"
          emptyText="No students yet. Upload the workbook above."
        />
      </main>
    </>
  );
}

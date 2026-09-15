import { notFound } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import type { GridColumn } from '@/lib/grid';
import { eventReport, getEvent } from '@/lib/repo';
import { gradeGridRow, PRESENCE } from '@/lib/tables';
import { saveGradesTable } from '../../../table-actions';

export const dynamic = 'force-dynamic';

export default async function GradesPage({ params }: { params: Promise<{ id: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const report = await eventReport(event);
  const grades = [...report.grades].sort(
    (a, b) => a.student.section.localeCompare(b.student.section) || a.student.surname.localeCompare(b.student.surname) || a.student.first_name.localeCompare(b.student.first_name),
  );
  const bands = event.rubric.grades;
  const noGrade = grades.filter((g) => !g.letter && !g.absent).length;

  const columns: GridColumn[] = [
    { key: 'student', label: 'Student No.', width: '7.6rem' },
    { key: 'name', label: 'Name (per class roll)', width: 'minmax(10rem, 1.8fr)' },
    { key: 'section', label: 'Section', filter: true, width: '5.6rem' },
    { key: 'group', label: 'Group', filter: true, width: 'minmax(8rem, 1.3fr)' },
    { key: 'adviser', label: 'Adviser', filter: true, width: 'minmax(7rem, 1fr)' },
    { key: 'total', label: 'Member total', type: 'number', align: 'right', width: '5.6rem' },
    { key: 'overall', label: 'Group overall', type: 'number', align: 'right', width: '5.6rem' },
    { key: 'final', label: 'Final grade', type: 'number', align: 'right', width: '5.2rem' },
    { key: 'rounded', label: 'Rounded up', type: 'number', align: 'right', width: '5rem' },
    { key: 'letter', label: 'Letter', filter: true, align: 'center', width: '4.4rem' },
    { key: 'qp', label: 'QP', type: 'number', align: 'right', width: '3.6rem' },
    { key: 'absent', label: 'At the defense', type: 'choice', editable: true, options: PRESENCE, filter: true, width: '6.6rem' },
    { key: 'status', label: 'Status', filter: true, width: '6.8rem' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page wide">
        <EventHeader event={event} tab="grades" title="Individual grades" />
        <p className="lead">
          Final grade = (member total + group overall %) ÷ 2, worked out from the two-decimal numbers shown, rounded up to a whole number, then given its letter. Member total adds
          up the average Presentation /20, Communication /40 and Q&amp;A /40 across the defense judges who submitted a sheet.
        </p>
        <p className="sub">
          Bands: {bands.map((b) => `${b.min}–${b.max} ${b.letter} (${b.qualityPoints})`).join(' · ')}. A missing score is never counted as zero: a student gets a grade only once
          their member scores and their group are complete.{' '}
          {noGrade ? `${noGrade} student${noGrade === 1 ? ' has' : 's have'} no grade yet: choose No grade yet under Status, and select a Status cell to see why.` : ''}
        </p>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="btn small secondary" href={`/api/admin/events/${id}/export`}>
            Download grade sheet (Excel)
          </a>
        </div>
        <DataGrid
          label="Individual grades"
          columns={columns}
          rows={grades.map((g) => gradeGridRow(event, g))}
          save={saveGradesTable.bind(null, id)}
          canAdd={false}
          rowName="name"
          searchPlaceholder="Search names, student numbers, groups and advisers"
          emptyText="No group members yet."
        />
      </main>
    </>
  );
}

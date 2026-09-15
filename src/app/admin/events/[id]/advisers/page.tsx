import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import type { GridColumn } from '@/lib/grid';
import { getEvent, listAdvisers } from '@/lib/repo';
import { adviserGridRow, type AdviserListRow } from '@/lib/tables';
import { importAdvisers, makeAdviserCodes } from '../../../actions';
import { removeAdvisersTable, saveAdvisersTable } from '../../../table-actions';

export const dynamic = 'force-dynamic';

export default async function AdvisersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const advisers = (await listAdvisers(id)) as AdviserListRow[];
  const withoutCode = advisers.filter((a) => !a.link_code).length;
  const released = !!event.released_at;

  const columns: GridColumn[] = [
    { key: 'name', label: 'Adviser', editable: true, required: true, width: 'minmax(12rem, 2fr)' },
    { key: 'email', label: 'Email', editable: true, width: 'minmax(12rem, 2fr)' },
    { key: 'code', label: 'Adviser code', editable: true, width: '9rem' },
    { key: 'groups', label: 'Groups', type: 'number', align: 'right', width: '6rem' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page wide">
        <EventHeader event={event} tab="advisers" title="Advisers" />
        <Notice ok={sp.ok} error={sp.error} />
        {released ? (
          <div className="notice warn">
            Results have been released. An import can still change which adviser a group has. If it does, both advisers’ result pages and the adviser ranking change, and the
            mailing sheet already sent no longer matches. Each change is recorded on the group’s page.
          </div>
        ) : null}

        <form action={importAdvisers} className="card form">
          <h3>Import the adviser list</h3>
          <input type="hidden" name="eventId" value={id} />
          <p className="sub" style={{ margin: 0 }}>
            An Excel file (.xlsx) with an <b>Adviser</b> column. Add <b>Email</b> if you have it, a <b>Group Name</b> column to set each group’s adviser in one go (one row per
            group, the name spelled as on the Groups table), and an <b>Adviser Code</b> column if you have already chosen codes. Importing again updates, it never duplicates.
          </p>
          <input className="input" type="file" name="file" accept=".xlsx" required />
          <button className="btn" type="submit">
            Import
          </button>
          <div className="actions" style={{ marginTop: 0 }}>
            <a className="btn small secondary" href="/api/admin/templates/advisers">
              Download template
            </a>
            <span className="sub">An Excel file with exactly the columns the import reads, and one example row.</span>
          </div>
        </form>

        <div className="section-title">Advisers</div>
        <p className="sub" style={{ marginTop: 0 }}>
          Type in the last row to add an adviser. Each adviser types their <b>adviser code</b> to open their private results link: hand it to them yourself, for example at a
          faculty meeting; it is never in the email. An adviser without an email or a code gets no link.
        </p>
        {advisers.length ? (
          <form action={makeAdviserCodes} className="actions" style={{ marginTop: 0, marginBottom: 8 }}>
            <input type="hidden" name="eventId" value={id} />
            <button className="btn small secondary" type="submit" disabled={!withoutCode}>
              Make codes for the {withoutCode} adviser{withoutCode === 1 ? '' : 's'} without one
            </button>
          </form>
        ) : null}
        <DataGrid
          label="Advisers"
          columns={columns}
          rows={advisers.map(adviserGridRow)}
          save={saveAdvisersTable.bind(null, id)}
          remove={released ? undefined : removeAdvisersTable.bind(null, id)}
          removeLabel="Remove adviser"
          addHint="Add an adviser here"
          rowName="name"
          searchPlaceholder="Search advisers"
          emptyText="No advisers yet."
        />
      </main>
    </>
  );
}

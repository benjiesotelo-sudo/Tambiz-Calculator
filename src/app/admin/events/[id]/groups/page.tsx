import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import type { GridColumn } from '@/lib/grid';
import { getEvent, listAdvisers, listGroups } from '@/lib/repo';
import { groupGridRow } from '@/lib/tables';
import { removeGroupsTable, saveGroupsTable } from '../../../table-actions';

export const dynamic = 'force-dynamic';

export default async function GroupsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [groups, advisers] = await Promise.all([listGroups(id), listAdvisers(id)]);
  const released = !!event.released_at;

  const columns: GridColumn[] = [
    { key: 'code', label: 'Code', editable: true, width: '6.5rem' },
    { key: 'name', label: 'Business name', editable: true, required: true, width: 'minmax(11rem, 2fr)' },
    { key: 'section', label: 'Section', editable: true, filter: true, width: '7.5rem' },
    {
      key: 'adviser',
      label: 'Adviser',
      type: 'choice',
      editable: true,
      allowNew: true,
      newHint: 'Enter adds “{text}” as a new adviser',
      options: advisers.map((a) => ({ value: a.id, label: a.name, hint: a.email })),
      filter: true,
      width: 'minmax(11rem, 1.6fr)',
    },
    { key: 'members', label: 'Members', type: 'number', align: 'right', width: '6.5rem' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page wide">
        <EventHeader event={event} tab="groups" title="Groups" />
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          One row per group. Type into a cell to change it; to add a group, type in the last row (leave the code empty and the app gives the next one). Press a business
          name to add its members.
        </p>
        {released ? (
          <div className="notice warn">
            Results have been released. You can still correct a group’s code, name or adviser; each change is recorded on the group’s page with your name and the time. A new
            adviser changes both advisers’ result pages and the adviser ranking, and the mailing sheet already sent no longer matches. No group can be added or deleted.
          </div>
        ) : null}
        <DataGrid
          label="Groups"
          columns={columns}
          rows={groups.map((g) => groupGridRow(event, g))}
          save={saveGroupsTable.bind(null, id)}
          remove={released ? undefined : removeGroupsTable.bind(null, id)}
          removeLabel="Delete group"
          canAdd={!released}
          addHint="Add a group here"
          rowName="name"
          searchPlaceholder="Search groups, sections and advisers"
          emptyText="No groups yet."
        />
      </main>
    </>
  );
}

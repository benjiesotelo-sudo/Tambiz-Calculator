import { notFound } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import type { GridColumn } from '@/lib/grid';
import { byGroupName, eventReport, getEvent } from '@/lib/repo';
import { adviserRanking, fmtPct } from '@/lib/scoring';
import { resultGridRow } from '@/lib/tables';

export const dynamic = 'force-dynamic';

const Rank = ({ r }: { r: number | null }) => (r === null ? null : <span className={`rank${r <= 3 ? ` r${r}` : ''}`}>{r}</span>);

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const report = await eventReport(event);
  const incomplete = report.results.groups.filter((g) => !g.complete && !g.accepted).length;
  const standings = adviserRanking(report.groups.map((g) => ({ adviserId: g.adviser_id, result: report.resultById.get(g.id)! })));
  const advisers = report.groups
    .filter((g, i, all) => g.adviser_id && standings.has(g.adviser_id) && all.findIndex((x) => x.adviser_id === g.adviser_id) === i)
    .map((g) => ({ id: g.adviser_id!, name: g.adviser_name ?? '', ...standings.get(g.adviser_id!)! }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  // One row per group, every group, in overall order; groups without an overall rank last.
  const rows = report.groups
    .map((g) => ({ g, r: report.resultById.get(g.id)! }))
    .sort((a, b) => (a.r.overallRank ?? 1e9) - (b.r.overallRank ?? 1e9) || byGroupName(a.g.name, b.g.name))
    .map(({ g, r }) => resultGridRow(event, g, r));
  const categories = report.results.groups[0]?.categories ?? [];
  const columns: GridColumn[] = [
    { key: 'group', label: 'Group', width: 'minmax(9rem, 1.6fr)' },
    { key: 'section', label: 'Sec', filter: true, width: '4.6rem' },
    { key: 'adviser', label: 'Adviser', filter: true, width: 'minmax(6.5rem, 1fr)' },
    ...categories.map((c): GridColumn => ({ key: `c:${c.key}`, label: c.name, type: 'number', align: 'right', width: 'minmax(6.2rem, .8fr)' })),
    { key: 'overall', label: 'Overall', type: 'number', align: 'right', width: '5.4rem' },
    { key: 'rank', label: 'Rank', type: 'number', align: 'right', width: '3.8rem' },
    { key: 'judged', label: 'Judged', filter: true, width: '6.6rem' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page wide">
        <EventHeader event={event} tab="results" title="Results" />
        <p className="lead">
          {event.status === 'finalised' ? 'Final results.' : 'Live preview: these change as judges submit.'} Overall = Defense × {event.rubric.halves.defense.weight} + Booth ×{' '}
          {event.rubric.halves.booth.weight}. Only submitted sheets count, a blank is never a zero, and a group is ranked once every criterion in both halves has a score.
          {incomplete ? ` ${incomplete} group${incomplete === 1 ? ' is' : 's are'} incomplete right now.` : ''}
        </p>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="btn small secondary" href={`/api/admin/events/${id}/export`}>
            Download Excel workbook
          </a>
        </div>

        <div className="section-title">Top 10 for the awarding</div>
        <div className="lb-grid compact">
          {report.results.leaderboards.map((lb) => (
            <div className="lb-card" key={lb.key}>
              <div className={`lb-head ${lb.half === 'booth' ? 'booth' : lb.half === 'overall' ? 'overall' : ''}`}>{lb.name}</div>
              {lb.entries.length ? (
                lb.entries.map((e) => (
                  <div className="lb-item" key={e.id}>
                    <Rank r={e.rank} />
                    <span className="nm">{e.name}</span>
                    <span className="pc">{fmtPct(e.score)}</span>
                  </div>
                ))
              ) : (
                <div className="lb-empty">No complete scores yet</div>
              )}
            </div>
          ))}
        </div>
        <p className="sub">
          Ranked on the two-decimal percentages shown. When two groups show the same category percentage, the higher overall goes first; they share a place only if both are
          equal. Every group tied at 10th is listed.
        </p>

        <div className="section-title">Every group</div>
        <p className="sub" style={{ marginTop: 0 }}>
          Each category shows the percentage and, after the dot, its rank. Click a heading (or use Sort on a phone) to sort by any column; search or filter by section, adviser or
          whether the group is fully judged.
        </p>
        <DataGrid label="Results" columns={columns} rows={rows} rowName="group" searchPlaceholder="Search groups, sections and advisers" emptyText="No groups yet." />

        <div className="section-title">Adviser ranking</div>
        <p className="sub" style={{ marginTop: 0 }}>
          The average of the overall percentages of each adviser’s ranked groups; advisers with the same average share a position. Only you see this table: each adviser sees just
          their own groups’ average overall, never a position.
        </p>
        <ul className="list">
          {advisers.map((a) => (
            <li key={a.id}>
              <Rank r={a.rank} />
              <span className="grow-1">
                <span className="title">{a.name}</span>
                <span className="sub" style={{ display: 'block' }}>
                  {a.groups} ranked group{a.groups === 1 ? '' : 's'}
                </span>
              </span>
              <span className="bignum" style={{ fontSize: 17 }}>
                {fmtPct(a.average)}
              </span>
            </li>
          ))}
          {!advisers.length ? <li className="sub">No adviser has a ranked group yet.</li> : null}
        </ul>
      </main>
    </>
  );
}

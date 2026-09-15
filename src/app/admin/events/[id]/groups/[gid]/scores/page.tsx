import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { DataGrid } from '@/components/DataGrid';
import { requireAdmin } from '@/lib/auth';
import type { GridColumn } from '@/lib/grid';
import { getEvent, getGroup, groupMembers, groupScoreDetail } from '@/lib/repo';
import type { Half } from '@/lib/rubric';
import { fmtScore } from '@/lib/sheet';
import { scoreGridRows } from '@/lib/tables';
import { saveScoresTable } from '../../../../../table-actions';

export const dynamic = 'force-dynamic';

// Every judge's scores for one group and half, as one table: a row per score box, a column per judge (decision 7).

export default async function GroupScoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; gid: string }>;
  searchParams: Promise<{ ok?: string; error?: string; half?: string }>;
}) {
  const acc = await requireAdmin();
  const { id, gid } = await params;
  const sp = await searchParams;
  const half: Half = sp.half === 'booth' ? 'booth' : 'defense';
  const event = await getEvent(id);
  if (!event) notFound();
  const group = await getGroup(id, gid);
  if (!group) notFound();
  const [detail, members] = await Promise.all([groupScoreDetail(event, gid, half), half === 'defense' ? groupMembers(gid) : Promise.resolve([])]);
  const halfDef = event.rubric.halves[half];
  const locked = !!event.released_at;
  const base = `/admin/events/${id}/groups/${gid}`;

  const columns: GridColumn[] = [
    { key: 'category', label: half === 'defense' ? 'Category or member' : 'Category', filter: true, width: 'minmax(8rem, 1.1fr)' },
    { key: 'item', label: 'Criterion', width: 'minmax(10rem, 2fr)' },
    { key: 'max', label: 'Max', type: 'number', align: 'right', width: '4rem' },
    ...detail.sheets.map(
      (sh): GridColumn => ({
        key: sh.id,
        label: `${sh.judge_name} · ${sh.status === 'complete' ? 'submitted' : 'in progress, not counted'}`,
        type: 'number',
        editable: true,
        align: 'right',
        width: 'minmax(7rem, 1fr)',
      }),
    ),
    { key: 'avg', label: 'Average of submitted', type: 'number', align: 'right', width: '7rem' },
  ];

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className={`page wide half-${half}`}>
        <div className="crumbs">
          <Link href={base}>‹ {group.name}</Link>
        </div>
        <div className="eyebrow">{event.title} · Scores and corrections</div>
        <h1 className="page-title">
          {group.name} · {halfDef.label}
        </h1>
        <nav className="tabs" aria-label="Half">
          {(['defense', 'booth'] as Half[]).map((h) => (
            <Link key={h} href={`${base}/scores?half=${h}`} className={h === half ? 'on' : ''}>
              {event.rubric.halves[h].label} scores
            </Link>
          ))}
        </nav>
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          Every judge’s scores for this group, one column per judge. To correct a score, type the reason first, then type the new score over the old one (empty it to remove
          the score). The judge’s own score is kept, the cell turns yellow, and selecting it shows what the judge gave and why it changed. Only submitted sheets count.
        </p>
        {locked ? <div className="notice warn">Results have been released, so scores can no longer be corrected.</div> : null}
        {!detail.sheets.length ? (
          <div className="notice warn">No judge has scored this group’s {halfDef.label.toLowerCase()} yet.</div>
        ) : (
          <DataGrid
            label={`${group.name} ${halfDef.label} scores`}
            columns={columns}
            rows={scoreGridRows(event, half, detail, members)}
            save={locked ? undefined : saveScoresTable.bind(null, id, gid, half)}
            canAdd={false}
            note={
              locked
                ? undefined
                : { label: 'Reason for these corrections', placeholder: 'For example: judge confirmed 18, typed 13', requiredMessage: 'Type the reason for the correction first, in the box above the table.' }
            }
            rowName="item"
            searchPlaceholder="Search criteria and members"
          />
        )}

        <div className="section-title">Corrections made</div>
        <p className="sub" style={{ marginTop: 0 }}>
          As they stood when this page opened; corrections you make now show in their cells straight away.
        </p>
        <ul className="list">
          {detail.history.map((h, i) => (
            <li key={i} style={{ display: 'block' }}>
              <div className="title">
                {h.detail.label} · {h.detail.judge}: {h.detail.from === null || h.detail.from === undefined ? 'blank' : fmtScore(h.detail.from)} →{' '}
                {h.detail.to === null || h.detail.to === undefined ? 'blank' : fmtScore(h.detail.to)}
              </div>
              <div className="sub">
                {h.who ?? 'Coordinator'}, {new Date(h.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}. Reason: {h.detail.reason}
              </div>
            </li>
          ))}
          {!detail.history.length ? <li className="sub">No corrections in this half.</li> : null}
        </ul>
      </main>
    </>
  );
}

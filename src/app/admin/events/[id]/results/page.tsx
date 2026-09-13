import { notFound } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { eventReport, getEvent } from '@/lib/repo';
import { fmtPct } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

const Rank = ({ r }: { r: number | null }) => (r === null ? null : <span className={`rank${r <= 3 ? ` r${r}` : ''}`}>{r}</span>);

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const report = await eventReport(event);
  const rows = [...report.results.groups].sort((a, b) => (a.overallRank ?? 1e9) - (b.overallRank ?? 1e9) || a.name.localeCompare(b.name));
  const codeOf = new Map(report.groups.map((g) => [g.id, g.code]));
  const incomplete = rows.filter((g) => !g.complete && !g.accepted).length;

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="results" title="Results" />
        <p className="lead">
          {event.status === 'finalised' ? 'Final results.' : 'Live preview: these change as judges score.'} Overall = Defense × {event.rubric.halves.defense.weight} + Booth ×{' '}
          {event.rubric.halves.booth.weight}. Every category counts equally within its half.
        </p>
        <div className="notice ok">
          <b>A blank score is never counted as zero.</b> Anything nobody has scored shows a dash and is left out. A group reads <b>Incomplete</b> until every criterion in both
          halves has a score, and only complete scores are ranked.
          {incomplete ? ` ${incomplete} group${incomplete === 1 ? ' is' : 's are'} incomplete right now.` : ''}
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="btn small secondary" href={`/api/admin/events/${id}/export`}>
            Download Excel workbook
          </a>
        </div>

        <div className="section-title">Top 10 leaderboard</div>
        <p className="sub">
          Ranked on the percentages shown. When two groups show the same percentage, the one with the higher overall score goes first; they share a place only if both are equal.
        </p>
        <div className="lb-grid">
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

        <div className="section-title">Every group by category</div>
        <p className="sub">The same ranks as the leaderboard. Groups without an overall rank are listed last.</p>
        {rows.map((g) => (
          <div className="card" key={g.id}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="code">{codeOf.get(g.id)}</span>
              <h3 style={{ margin: 0, flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere' }}>{g.name}</h3>
              {g.complete || g.accepted ? <span className="bignum">{fmtPct(g.overall)}</span> : <span className="pill part">Incomplete</span>}
              <Rank r={g.overallRank} />
            </div>
            <div className="sub">
              Defense {fmtPct(g.defense)}
              {g.defense !== null && !g.defenseComplete ? ' (incomplete)' : ''} · Booth {fmtPct(g.booth)}
              {g.booth !== null && !g.boothComplete ? ' (incomplete)' : ''}
              {!g.complete && !g.accepted && g.overall !== null ? ` · ${fmtPct(g.overall)} from what is scored so far` : ''}
              {g.accepted ? ' · Finalised without every score (see Progress)' : ''}
            </div>
            <div className="catgrid">
              {g.categories.map((c) => (
                <div key={c.key} className={`catcell ${c.half}`}>
                  <div className="n" title={c.name}>
                    {c.name}
                  </div>
                  <div className="v">
                    <span>{fmtPct(c.pct)}</span>
                    <Rank r={c.rank} />
                  </div>
                  {c.pct !== null && !c.complete ? <div className="n">incomplete</div> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
        {!rows.length ? <p className="sub">No groups yet.</p> : null}
      </main>
    </>
  );
}

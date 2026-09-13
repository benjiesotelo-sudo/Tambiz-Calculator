import { notFound } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { eventReport, getEvent } from '@/lib/repo';
import { fmt1 } from '@/lib/scoring';

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

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="results" title="Results" />
        <p className="lead">
          {event.status === 'finalised' ? 'Final results.' : 'Live preview: these change as judges score.'} Overall = Defense × {event.rubric.halves.defense.weight} + Booth ×{' '}
          {event.rubric.halves.booth.weight}. Every category counts equally within its half.
        </p>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="btn small secondary" href={`/api/admin/events/${id}/export`}>
            Download Excel workbook
          </a>
        </div>

        <div className="section-title">Top 10 leaderboard</div>
        <div className="lb-grid">
          {report.results.leaderboards.map((lb) => (
            <div className="lb-card" key={lb.key}>
              <div className={`lb-head ${lb.half === 'booth' ? 'booth' : lb.half === 'overall' ? 'overall' : ''}`}>{lb.name}</div>
              {lb.entries.length ? (
                lb.entries.map((e) => (
                  <div className="lb-item" key={e.id}>
                    <Rank r={e.rank} />
                    <span className="nm">{e.name}</span>
                    <span className="pc">{fmt1(e.score)}%</span>
                  </div>
                ))
              ) : (
                <div className="lb-empty">No scores yet</div>
              )}
            </div>
          ))}
        </div>

        <div className="section-title">Every group by category</div>
        <p className="sub">Ranks as in the old Results table: a tie in a category is broken by overall score.</p>
        {rows.map((g) => (
          <div className="card" key={g.id}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="code">{codeOf.get(g.id)}</span>
              <h3 style={{ margin: 0, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{g.name}</h3>
              <span className="bignum">{g.overall === null ? '—' : `${fmt1(g.overall)}%`}</span>
              <Rank r={g.overallRank} />
            </div>
            <div className="sub">
              Defense {g.defense === null ? '—' : `${fmt1(g.defense)}%`} · Booth {g.booth === null ? '—' : `${fmt1(g.booth)}%`}
            </div>
            <div className="catgrid">
              {g.categories.map((c) => (
                <div key={c.key} className={`catcell ${c.half}`}>
                  <div className="n" title={c.name}>
                    {c.name}
                  </div>
                  <div className="v">
                    <span>{c.pct === null ? '—' : `${fmt1(c.pct)}%`}</span>
                    <Rank r={c.rank} />
                  </div>
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

import { notFound } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { eventReport, getEvent, rollName } from '@/lib/repo';
import { fmt2, fmtPct } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

export default async function GradesPage({ params }: { params: Promise<{ id: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const report = await eventReport(event);
  const bySection = new Map<string, typeof report.grades>();
  for (const g of [...report.grades].sort((a, b) => a.student.section.localeCompare(b.student.section) || a.student.surname.localeCompare(b.student.surname))) {
    const list = bySection.get(g.student.section) ?? [];
    list.push(g);
    bySection.set(g.student.section, list);
  }
  const bands = event.rubric.grades;
  const why = (g: (typeof report.grades)[number]) =>
    [!g.memberComplete ? 'member scores incomplete' : '', !g.groupReady ? 'group not fully judged' : ''].filter(Boolean).join(' · ');

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="grades" title="Individual grades" />
        <p className="lead">
          Final grade = (member total + group overall %) ÷ 2, worked out from the two-decimal numbers shown, rounded up to a whole number, then given its letter. Member total adds
          up the average Presentation /20, Communication /40 and Q&amp;A /40 across the defense judges who scored each one.
        </p>
        <p className="sub">
          Bands: {bands.map((b) => `${b.min}–${b.max} ${b.letter} (${b.qualityPoints})`).join(' · ')}. A missing score is never counted as zero: a student gets a grade only once
          their member scores and their group are complete.
        </p>
        <div className="actions" style={{ marginTop: 0 }}>
          <a className="btn small secondary" href={`/api/admin/events/${id}/export`}>
            Download grade sheet (Excel)
          </a>
        </div>

        {[...bySection.entries()].map(([section, list]) => (
          <div key={section}>
            <div className="section-title">
              {section} · {list.length} student{list.length === 1 ? '' : 's'}
            </div>
            {list.map((g) => (
              <div className="card" key={g.student.id}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title" style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                      {rollName(g.student)}
                    </div>
                    <div className="sub">
                      {g.student.student_number} · {g.group.code} {g.group.name}
                    </div>
                  </div>
                  {g.letter ? <span className={`letter${g.letter === 'F' ? ' f' : ''}`}>{g.letter}</span> : <span className="pill err">No grade yet</span>}
                </div>
                <div className="kv">
                  <div>
                    <span>Member total{g.total !== null && !g.memberComplete ? ' (incomplete)' : ''}</span>
                    <b>{g.total === null ? '—' : fmt2(g.total)}</b>
                  </div>
                  <div>
                    <span>Group overall{g.overall !== null && !g.groupReady ? ' (incomplete)' : ''}</span>
                    <b>{fmtPct(g.overall)}</b>
                  </div>
                  <div>
                    <span>Final grade</span>
                    <b>{g.final === null ? '—' : fmt2(g.final)}</b>
                  </div>
                  <div>
                    <span>Rounded up</span>
                    <b>{g.rounded ?? '—'}</b>
                  </div>
                  <div>
                    <span>Quality points</span>
                    <b>{g.qualityPoints ?? '—'}</b>
                  </div>
                </div>
                {!g.letter && why(g) ? (
                  <div className="sub" style={{ marginTop: 6, color: 'var(--error-ink)', fontWeight: 700 }}>
                    No grade because: {why(g)}.
                  </div>
                ) : null}
                {g.perJudge.length ? (
                  <div className="sub" style={{ marginTop: 6 }}>
                    {g.perJudge.map((p) => `${p.judge}: ${[p.set.presentation, p.set.communication, p.set.qa].map((v) => v ?? '–').join(' / ')}`).join(' · ')}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
        {!report.grades.length ? <p className="sub">No group members yet.</p> : null}
      </main>
    </>
  );
}

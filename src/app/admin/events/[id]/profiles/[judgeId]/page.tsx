import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { statusLabel } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { halfSummary } from '@/lib/judge-profiles';
import { ordinal } from '@/lib/link-rules';
import { judgeEventProfile, signedPoints } from '@/lib/profiles-data';
import { getEvent } from '@/lib/repo';
import type { Half } from '@/lib/rubric';
import { fmt2 } from '@/lib/scoring';
import { ProfileCaveats } from '@/components/ProfileCaveats';

export const dynamic = 'force-dynamic';

// One judge in detail (item 14; walkthrough page 32).

export default async function JudgeProfilePage({ params, searchParams }: { params: Promise<{ id: string; judgeId: string }>; searchParams: Promise<{ half?: string }> }) {
  const acc = await requireAdmin();
  const { id, judgeId } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const found = await judgeEventProfile(event, judgeId);
  if (!found) notFound();
  const { profile: p, history, scoredHere } = found;
  const half: Half = sp.half === 'booth' || (sp.half !== 'defense' && !p.halves.defense.groupsScored && p.halves.booth.groupsScored) ? 'booth' : 'defense';
  const h = p.halves[half];
  const base = `/admin/events/${id}/profiles/${judgeId}`;
  const gap = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt2(Math.abs(n))}`;

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <div className="crumbs">
          <Link href={`/admin/events/${id}/profiles`}>‹ Judge profiles</Link>
        </div>
        <div className="eyebrow">
          {event.title} · {statusLabel(event)} · {event.rubric.halves[half].label}
        </div>
        <h1 className="page-title">{p.judgeName}</h1>
        {!scoredHere ? (
          <div className="notice warn">
            {p.judgeName} has not scored any group in {event.title} yet, so there is nothing to compare yet. Their record from other events is below.
          </div>
        ) : (
        <>
        <p className="lead">
          Marks at <b>{signedPoints(h.marksAt)}</b> · separates groups: <b>{h.spread?.level ?? '—'}</b> · agrees with co-judges: <b>{h.agreement?.level ?? '—'}</b>.{' '}
          {halfSummary(h)}
        </p>
        <nav className="tabs" aria-label="Half">
          {(['defense', 'booth'] as Half[]).map((x) => (
            <Link key={x} href={`${base}?half=${x}`} className={x === half ? 'on' : ''}>
              {event.rubric.halves[x].label} · {p.halves[x].groupsScored} group{p.halves[x].groupsScored === 1 ? '' : 's'}
            </Link>
          ))}
        </nav>

        <div className="ptable" role="table" aria-label={`${p.judgeName}, ${event.rubric.halves[half].label}`}>
          <div className="prow phead" role="row">
            <span role="columnheader">Group</span>
            <span role="columnheader">Their score</span>
            <span role="columnheader">Others’ average</span>
            <span role="columnheader">Gap</span>
            <span role="columnheader">Order: theirs · panel</span>
            <span role="columnheader">To look at</span>
          </div>
          {h.rows.map((r) => (
            <div className="prow" role="row" key={r.groupId}>
              <span role="cell" className="pgroup">
                {r.groupName}
              </span>
              <span role="cell" data-label="Their score">
                {fmt2(r.their)}
              </span>
              <span role="cell" data-label="Others’ average">
                {fmt2(r.others)}
              </span>
              <span role="cell" data-label="Gap">
                {gap(r.gap)}
              </span>
              <span role="cell" data-label="Order: theirs · panel">
                {ordinal(r.theirOrder)} · {ordinal(r.panelOrder)}
              </span>
              <span role="cell" className="pflags" data-label="To look at">
                {r.flags.length ? r.flags.map((f) => <span key={f} className="flag">{f}</span>) : <span className="sub">None</span>}
              </span>
            </div>
          ))}
          {!h.rows.length ? <div className="prow sub">No group in this half had a co-judge to compare with.</div> : null}
        </div>
        {h.uncompared.length ? (
          <>
            <p className="sub">Scored with no co-judge, so not compared:</p>
            <ul className="list">
              {h.uncompared.map((u) => (
                <li key={u.groupId} style={{ flexWrap: 'wrap' }}>
                  <span className="grow-1">
                    {u.groupName}
                  </span>
                  {u.flags.map((f) => (
                    <span key={f} className="flag">
                      {f}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        </>
        )}

        <div className="section-title">Across events</div>
        <p className="sub" style={{ marginTop: 0 }}>
          Kept against the person, not the login, year after year: one line per event this judge scored in.
        </p>
        {!history.length ? <p className="sub">No scores in any event yet.</p> : null}
        <div className="grid">
          {history.map(({ event: e, profile: x }) => (
            <Link key={e.id} className={`tile${e.id === id ? ' on' : ''}`} href={`/admin/events/${e.id}/profiles/${judgeId}`}>
              <b>
                {e.title} <span className="sub">· {x.groups} group{x.groups === 1 ? '' : 's'}</span>
              </b>
              <span className="sub">
                {signedPoints(x.marksAt)} · {x.separation ?? '—'} · {x.agreement ?? '—'}
              </span>
            </Link>
          ))}
        </div>

        <div className="section-title">Worth remembering</div>
        <ProfileCaveats />
        <p className="sub">
          This is only possible because each judge signs in as themselves. The old spreadsheets labelled judges “Panelist 1, 2, 3” inside each group, so the same label in two
          groups may be two different people.
        </p>
      </main>
    </>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { ProfileCaveats } from '@/components/ProfileCaveats';
import { requireAdmin } from '@/lib/auth';
import { FAR_POINTS, MIN_GROUPS } from '@/lib/judge-profiles';
import { capital, eventProfiles, signedPoints } from '@/lib/profiles-data';
import { getEvent } from '@/lib/repo';

export const dynamic = 'force-dynamic';

// Judge profiles, coordinator only (item 14; walkthrough page 31). Describes; never prescribes.

export default async function JudgeProfilesPage({ params }: { params: Promise<{ id: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const profiles = await eventProfiles(event);

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="profiles" title="Judge profiles" />
        <p className="lead">
          How each judge’s scores compare with the other judges who scored the same groups, in the same half. A basis for knowing the panel, not for removing anyone. It
          describes; it does not decide.
        </p>
        <ProfileCaveats />

        <div className="section-title">By judge</div>
        <ul className="list profiles">
          {profiles.map((p) => (
            <li key={p.judgeId}>
              <Link className="profile-row" href={`/admin/events/${id}/profiles/${p.judgeId}`}>
                <span className="p-name">{p.judgeName}</span>
                <span className="p-cell">
                  <span className="p-label">Groups</span>
                  <b>{p.groups}</b>{' '}
                  <span className="sub">
                    {(['defense', 'booth'] as const)
                      .filter((h) => p.halves[h].groupsScored)
                      .map((h) => `${event.rubric.halves[h].label} ${p.halves[h].groupsScored}`)
                      .join(' · ')}
                  </span>
                </span>
                <span className="p-cell">
                  <span className="p-label">Marks at</span>
                  <b>{signedPoints(p.marksAt)}</b>
                </span>
                <span className="p-cell">
                  <span className="p-label">Separates groups</span>
                  <span className="pill none">{capital(p.separation)}</span>{' '}
                  {p.spreadRange ? (
                    <span className="sub">
                      {Math.round(p.spreadRange.low)}–{Math.round(p.spreadRange.high)}
                    </span>
                  ) : null}
                </span>
                <span className="p-cell">
                  <span className="p-label">Agrees with co-judges</span>
                  <span className="pill none">{capital(p.agreement)}</span>
                </span>
                <span className="p-summary sub">{p.summary}</span>
              </Link>
            </li>
          ))}
          {!profiles.length ? <li className="sub">No judges yet.</li> : null}
        </ul>

        <details className="inline-form" style={{ marginTop: 16 }}>
          <summary>How these are worked out</summary>
          <div className="card" style={{ marginTop: 8 }}>
            <p style={{ marginTop: 0 }}>
              Every comparison uses only the co-judges who scored <b>the same group in the same half</b>, and only the criteria both sides scored. Scores are worked out the same
              way as results: out of 100, categories averaged, blanks left out.
            </p>
            <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
              <li>
                <b>Groups</b>: how many groups the judge scored, in each half.
              </li>
              <li>
                <b>Marks at</b>: on the same groups, how far above or below the other judges they score, on average. −4.20 pts is about four points lower.
              </li>
              <li>
                <b>Separates groups</b>: whether they use the range or give nearly everyone the same mark. Their spread of scores is compared with the other judges’ spread on the
                same groups: narrow is under three quarters of it, wide is over a third more. The numbers are their lowest and highest score. Needs {MIN_GROUPS} groups.
              </li>
              <li>
                <b>Agrees with co-judges</b>: line the groups up by this judge’s scores, then by the other judges’ average (a rank correlation). High means much the same order
                (0.7 or more), medium partly (0.4 to 0.7), low a different order, even when the numbers differ. Needs {MIN_GROUPS} groups.
              </li>
              <li>
                <b>To look at</b> (on each judge’s page): the same mark entered down every criterion of a category, criteria left blank, and a score {FAR_POINTS} or more points
                from every co-judge’s.
              </li>
            </ul>
          </div>
        </details>
      </main>
    </>
  );
}

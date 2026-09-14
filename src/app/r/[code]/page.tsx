import type { Metadata } from 'next';
import { AppBar } from '@/components/AppBar';
import { one } from '@/lib/db';
import { MAX_TRIES, linkState } from '@/lib/link-rules';
import { findLink, hasLinkSession, type LinkRow } from '@/lib/links';
import { eventReport, getEvent, type EventReport } from '@/lib/repo';
import { adviserRanking, fmt2, fmtPct, TOP_PLACES, topTenPlacings, type GroupResult } from '@/lib/scoring';
import { checkLink, closeLink } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tambiz results', robots: { index: false, follow: false }, referrer: 'no-referrer' };

// A student's or adviser's private results page (decisions 8 and 9).
// Nothing about the person is shown until the right check value is typed.

function Shell({ children, subtitle = 'Your results' }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <>
      <AppBar title="Tambiz" subtitle={subtitle} />
      <main className="page narrow">{children}</main>
    </>
  );
}

function Closed({ title, text }: { title: string; text: string }) {
  return (
    <Shell>
      <div className="login-hero">
        <h1>Tambiz</h1>
      </div>
      <div className="card">
        <h3>{title}</h3>
        <p style={{ marginBottom: 0 }}>{text}</p>
      </div>
      <p className="note">MGT1114 Business Plan 2 · FEU Manila</p>
    </Shell>
  );
}

const CLOSED = {
  missing: { title: 'This link cannot be opened', text: 'Check that you opened the whole link from your email. If it still does not open, contact the MGT1114 coordinator.' },
  revoked: { title: 'This link is no longer in use', text: 'A newer link may have been sent to you. Use the most recent email, or contact the MGT1114 coordinator.' },
  locked: { title: 'This link is locked', text: `It was locked after ${MAX_TRIES} wrong tries. Contact the MGT1114 coordinator, who can unlock it or send you a new one.` },
  expired: { title: 'This link has expired', text: 'Links stay open for 30 days. Contact the MGT1114 coordinator if you still need your results.' },
} as const;

export default async function LinkPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ wrong?: string; closed?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const link = await findLink(code);
  if (!link) return <Closed {...CLOSED.missing} />;
  const state = linkState(link);
  if (state !== 'ok') return <Closed {...CLOSED[state]} />;

  if (!(await hasLinkSession(link))) {
    const student = link.recipient_type === 'student';
    const left = Number(sp.wrong);
    return (
      <Shell>
        <div className="login-hero">
          <h1>Tambiz</h1>
          <p>{student ? 'Your individual grade' : 'Results for the groups you advised'}</p>
        </div>
        {sp.closed ? <div className="notice ok">Closed. Open the link again whenever you like.</div> : null}
        {Number.isFinite(left) && sp.wrong ? (
          <div className="notice err" role="alert">
            That does not match our records. {left} {left === 1 ? 'try' : 'tries'} left before this link locks.
          </div>
        ) : null}
        <form action={checkLink} className="card form">
          <input type="hidden" name="code" value={code} />
          <div className="field">
            <label htmlFor="check">{student ? 'Your student number' : 'The adviser code the coordinator gave you'}</label>
            <input
              className="input"
              id="check"
              name="check"
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode={student ? 'numeric' : 'text'}
              placeholder={student ? 'For example 2023010457' : 'For example K7Q-4MP'}
            />
          </div>
          <button className="btn block" type="submit">
            See my results
          </button>
        </form>
        <p className="note">This link is for you only. Please do not forward it.</p>
      </Shell>
    );
  }

  const event = await getEvent(link.event_id);
  if (!event) return <Closed {...CLOSED.missing} />;
  const report = await eventReport(event);
  return link.recipient_type === 'student' ? <StudentResult link={link} code={code} report={report} /> : <AdviserResult link={link} code={code} report={report} />;
}

function CloseButton({ code }: { code: string }) {
  return (
    <form action={closeLink} style={{ marginTop: 16 }}>
      <input type="hidden" name="code" value={code} />
      <button className="btn secondary block" type="submit">
        Close my results
      </button>
    </form>
  );
}

/** A group's percentages, and where it placed in the top 10 without saying which place: places are revealed at the awarding. */
function GroupPercentages({ result }: { result: GroupResult }) {
  const top = topTenPlacings(result);
  return (
    <>
      {top.length ? (
        <p className="sub" style={{ margin: '6px 0 0' }}>
          <b>Top {TOP_PLACES}</b> in {top.join(', ')}. Places are announced at the awarding.
        </p>
      ) : null}
      <div className="kv">
        <div>
          <span>Defense</span>
          <b>{fmtPct(result.defense)}</b>
        </div>
        <div>
          <span>Booth</span>
          <b>{fmtPct(result.booth)}</b>
        </div>
      </div>
      <div className="catgrid">
        {result.categories.map((c) => (
          <div key={c.key} className={`catcell ${c.half}`}>
            <div className="n" title={c.name}>
              {c.name}
            </div>
            <div className="v">
              <span>{fmtPct(c.pct)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function StudentResult({ link, code, report }: { link: LinkRow; code: string; report: EventReport }) {
  const g = report.grades.find((x) => x.student.id === link.recipient_id);
  if (!g) return <Closed title="Your result is not available" text="You are no longer listed in a group for this event. Contact the MGT1114 coordinator." />;
  const result = report.resultById.get(g.group.id);
  const avg = (key: string) => {
    const vals = g.perJudge.map((p) => p.set[key as keyof typeof p.set]).filter((v): v is number => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return (
    <Shell subtitle={report.event.title}>
      <div className="eyebrow">{report.event.title} · Your result</div>
      <h1 className="page-title">
        {g.student.first_name} {g.student.surname}
      </h1>
      <p className="lead">
        {g.group.code} {g.group.name}
      </p>

      <div className="card result-hero">
        {g.absent ? (
          <p style={{ margin: 0 }}>
            You were marked <b>absent from the defense</b>, so your grade is given by the coordinator rather than worked out here. Contact the MGT1114 coordinator about it.
          </p>
        ) : g.letter ? (
          <>
            <span className={`letter big${g.letter === 'F' ? ' f' : ''}`}>{g.letter}</span>
            <div>
              <div className="sub">Final grade</div>
              <div className="bignum">{fmt2(g.final)}</div>
              <div className="sub">
                Rounded up to {g.rounded} · {g.qualityPoints} quality points
              </div>
            </div>
          </>
        ) : (
          <p style={{ margin: 0 }}>Your grade is not complete yet. Contact the MGT1114 coordinator.</p>
        )}
      </div>

      <div className="section-title">Your scores</div>
      <p className="sub" style={{ marginTop: 0 }}>
        Each is the average across the defense judges who scored it.
      </p>
      <div className="kv">
        {report.event.rubric.memberFields.map((f) => (
          <div key={f.key}>
            <span>
              {f.name} /{f.max}
            </span>
            <b>{g.absent ? '—' : (fmt2(avg(f.key)) || '—')}</b>
          </div>
        ))}
        <div>
          <span>Your total /100</span>
          <b>{g.absent || g.total === null ? '—' : fmt2(g.total)}</b>
        </div>
      </div>

      <div className="section-title">Your group</div>
      {result ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>
              {g.group.code} {g.group.name}
            </h3>
            <span className="bignum">{result.complete || result.accepted ? fmtPct(result.overall) : 'Incomplete'}</span>
          </div>
          <div className="sub">Overall = Defense × {report.event.rubric.halves.defense.weight} + Booth × {report.event.rubric.halves.booth.weight}</div>
          <GroupPercentages result={result} />
        </div>
      ) : null}
      <p className="sub">Final grade = (your total + your group’s overall %) ÷ 2, rounded up to a whole number.</p>
      <CloseButton code={code} />
    </Shell>
  );
}

async function AdviserResult({ link, code, report }: { link: LinkRow; code: string; report: EventReport }) {
  const adviser = await one<{ id: string; name: string }>('SELECT id, name FROM adviser WHERE id = $1 AND event_id = $2', [link.recipient_id, link.event_id]);
  if (!adviser) return <Closed {...CLOSED.missing} />;
  const mine = report.groups.filter((g) => g.adviser_id === adviser.id);
  // Decision 10: only this adviser's own average is shown, never the table of colleagues, and never a position.
  const standing = adviserRanking(report.groups.map((g) => ({ adviserId: g.adviser_id, result: report.resultById.get(g.id)! }))).get(adviser.id);
  return (
    <Shell subtitle={report.event.title}>
      <div className="eyebrow">{report.event.title} · Adviser</div>
      <h1 className="page-title">{adviser.name}</h1>
      <p className="lead">Results for the groups you advised.</p>

      <div className="notice warn">
        {standing ? (
          <>
            Your groups’ average overall, used for the adviser ranking: <b>{fmtPct(standing.average)}</b> across {standing.groups} group{standing.groups === 1 ? '' : 's'}.
            Positions are announced at the awarding.
          </>
        ) : (
          'You are not in the adviser ranking, because none of your groups has a complete result.'
        )}
      </div>

      {mine.map((g) => {
        const r = report.resultById.get(g.id)!;
        return (
          <div className="card" key={g.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>
                {g.code} {g.name}
              </h3>
              <span className="bignum">{r.complete || r.accepted ? fmtPct(r.overall) : 'Incomplete'}</span>
            </div>
            <GroupPercentages result={r} />
          </div>
        );
      })}
      {!mine.length ? <p className="sub">No groups are listed under your name.</p> : null}
      <p className="sub">The adviser ranking is the average of the overall percentages of each adviser’s groups. Advisers with the same average share a position.</p>
      <CloseButton code={code} />
    </Shell>
  );
}

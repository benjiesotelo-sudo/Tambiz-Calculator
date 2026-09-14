import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { requireAdmin } from '@/lib/auth';
import { getEvent, getGroup, groupMembers, groupScoreDetail, type StoredScore } from '@/lib/repo';
import { criterionLabel, type Half } from '@/lib/rubric';
import { critKey, fmtScore, memberKey } from '@/lib/sheet';
import { correctScore } from '../../../../../actions';

export const dynamic = 'force-dynamic';

// Every judge's scores for one group and half, with the coordinator's corrections (decision 7).

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

  const cell = (sheetId: string, judgeName: string, key: string, label: string, max: number) => {
    const stored: StoredScore | undefined = detail.scores.get(sheetId)?.get(key);
    const removed = stored ? undefined : detail.removed.get(sheetId)?.get(key);
    const show = (v: number | null) => (v === null ? 'no score' : fmtScore(v));
    return (
      <div className="corr" key={`${sheetId}:${key}`}>
        <span className="corr-judge">{judgeName}</span>
        <span className="corr-val">{stored ? fmtScore(stored.value) : '–'}</span>
        {stored?.correctedByName ? (
          <span className="corr-note">
            Corrected by the coordinator. The judge gave {show(stored.judgeValue)}. Reason: {stored.reason}
          </span>
        ) : null}
        {removed ? (
          <span className="corr-note">
            Corrected by the coordinator to blank. The judge gave {show(removed.judgeValue)}
            {removed.previous !== removed.judgeValue ? `; it was ${show(removed.previous)} before removal` : ''}. Reason: {removed.reason}
          </span>
        ) : null}
        {locked ? null : (
          <details className="inline-form corr-form">
            <summary>Correct</summary>
            <form action={correctScore} className="form">
              <input type="hidden" name="eventId" value={id} />
              <input type="hidden" name="sheetId" value={sheetId} />
              <input type="hidden" name="key" value={key} />
              <label className="field">
                <span className="label-text">
                  New score for {label}, out of {max} (leave empty to remove it)
                </span>
                <input className="input" name="value" inputMode="decimal" autoComplete="off" defaultValue={stored ? fmtScore(stored.value) : ''} style={{ maxWidth: 140 }} />
              </label>
              <label className="field">
                <span className="label-text">Reason</span>
                <input className="input" name="reason" required minLength={3} maxLength={200} placeholder="For example: judge confirmed 18, typed 13" />
              </label>
              <button className="btn small" type="submit">
                Save correction
              </button>
            </form>
          </details>
        )}
      </div>
    );
  };

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className={`page half-${half}`}>
        <div className="crumbs">
          <Link href={base}>‹ {group.name}</Link>
        </div>
        <div className="eyebrow">
          {event.title} · {group.code}
        </div>
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
          Every judge’s scores for this group. To correct one, press <b>Correct</b> beside it, type the new score and a short reason. The judge’s own score is kept, the entry
          shows as corrected by the coordinator, and the change is listed at the bottom of this page.
        </p>
        {locked ? <div className="notice warn">Results have been released, so scores can no longer be corrected.</div> : null}
        {!detail.sheets.length ? (
          <div className="notice warn">No judge has scored this group’s {halfDef.label.toLowerCase()} yet.</div>
        ) : (
          <>
            <p className="sub">
              Judges:{' '}
              {detail.sheets.map((s) => `${s.judge_name} (${s.status === 'complete' ? 'complete' : 'in progress'})`).join(', ')}
            </p>
            {halfDef.categories.map((cat) => (
              <div className="card" key={cat.key}>
                <h3>{cat.name}</h3>
                {cat.maxes.map((max, i) => {
                  const key = critKey(cat.key, i);
                  const label = `${cat.name} ${i + 1}`;
                  return (
                    <div className="corr-crit" key={key}>
                      <div className="corr-head">
                        <span className="num">{i + 1}</span>
                        <span className="grow-1">{criterionLabel(cat, i)}</span>
                        <span className="max">/{max}</span>
                      </div>
                      {detail.sheets.map((sh) => cell(sh.id, sh.judge_name, key, label, max))}
                    </div>
                  );
                })}
              </div>
            ))}
            {half === 'defense' ? (
              <>
                <div className="section-title">Members</div>
                {members.map((m) => (
                  <div className="card" key={m.id}>
                    <h3>
                      {m.first_name} {m.surname} {m.absent_at ? <span className="pill part">Absent</span> : null}
                    </h3>
                    {event.rubric.memberFields.map((f) => {
                      const key = memberKey(m.id, f.key);
                      return (
                        <div className="corr-crit" key={key}>
                          <div className="corr-head">
                            <span className="grow-1">{f.name}</span>
                            <span className="max">/{f.max}</span>
                          </div>
                          {detail.sheets.map((sh) => cell(sh.id, sh.judge_name, key, `${m.first_name} ${m.surname}, ${f.name}`, f.max))}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {!members.length ? <p className="sub">This group has no members.</p> : null}
              </>
            ) : null}
          </>
        )}

        <div className="section-title">Corrections made</div>
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

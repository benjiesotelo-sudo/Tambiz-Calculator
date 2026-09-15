'use client';

// The judge scoring screen (report section 8.2, prototype/index.html).
// Every keystroke is kept on the phone first, then sent in the background; the label in the bar always says which.

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { categoryMax, criterionLabel, type Category, type Half, type Rubric } from '@/lib/rubric';
import { fmtPct } from '@/lib/scoring';
import { absentKey, checkScore, critKey, fmtScore, memberKey } from '@/lib/sheet';
import { readDraft, writeDraft } from './draft';

interface Member {
  id: string;
  name: string;
  initials: string;
  section: string;
}

interface Props {
  eventTitle: string;
  judgeId: string;
  judgeName: string;
  closed: boolean;
  half: Half;
  rubric: Rubric;
  group: { id: string; name: string; section: string; adviser: string };
  members: Member[];
  initial: Record<string, number>;
  initialComplete: boolean;
}

type Step = { key: string; name: string; kind: 'cat'; cat: Category } | { key: string; name: string; kind: 'members' } | { key: string; name: string; kind: 'review' };
type Issue = { t: 'e' | 'b' | 'w'; key: string; text: string };
type SyncMode = 'ok' | 'offline' | 'auth' | 'closed';

export function ScoreSheet(props: Props) {
  const { rubric, half, group, members, judgeId } = props;
  const halfDef = rubric.halves[half];

  const steps: Step[] = useMemo(() => {
    const s: Step[] = halfDef.categories.map((c) => ({ key: c.key, name: c.name, kind: 'cat' as const, cat: c }));
    if (half === 'defense') s.push({ key: 'members', name: 'Members', kind: 'members' });
    s.push({ key: 'review', name: 'Review', kind: 'review' });
    return s;
  }, [halfDef, half]);

  const maxOf = useCallback(
    (key: string) => {
      const [kind, a, b] = key.split(':');
      if (kind === 'c') return halfDef.categories.find((c) => c.key === a)?.maxes[+b] ?? 0;
      if (kind === 'a') return 1;
      return rubric.memberFields.find((f) => f.key === b)?.max ?? 0;
    },
    [halfDef, rubric],
  );

  // Raw typed text for every box, and the boxes the server has not confirmed yet.
  const rawRef = useRef<Record<string, string>>(Object.fromEntries(Object.entries(props.initial).map(([k, v]) => [k, fmtScore(v)])));
  const dirtyRef = useRef<Set<string>>(new Set());
  const [, setVersion] = useState(0);
  const rerender = () => setVersion((v) => v + 1);
  const [complete, setComplete] = useState(props.initialComplete);
  const [mode, setMode] = useState<SyncMode>(props.closed ? 'closed' : 'ok');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stepKey, setStepKey] = useState(steps[0].key);
  const focusRef = useRef<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    const raw: Record<string, string> = {};
    let errors = 0;
    for (const [k, v] of Object.entries(rawRef.current)) {
      const isErr = checkScore(v, maxOf(k)).state === 'error';
      if (isErr) errors++;
      if (isErr || dirtyRef.current.has(k)) raw[k] = v;
    }
    writeDraft(judgeId, group.id, half, { raw, dirty: [...dirtyRef.current], errors, savedAt: Date.now() });
  }, [judgeId, group.id, half, maxOf]);

  // Bring back anything typed on this phone that never reached the server.
  useEffect(() => {
    const d = readDraft(judgeId, group.id, half);
    if (d) {
      for (const [k, v] of Object.entries(d.raw)) rawRef.current[k] = v;
      d.dirty.forEach((k) => dirtyRef.current.add(k));
      rerender();
    }
    const url = new URL(window.location.href);
    const s = url.searchParams.get('step');
    if (s && steps.some((x) => x.key === s)) setStepKey(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(
    async (extra?: { complete: boolean }): Promise<boolean> => {
      while (inflight.current) await inflight.current;
      if (props.closed) return false;
      const keys = [...dirtyRef.current];
      if (!keys.length && !extra) return true;
      const snapshot = keys.map((k) => [k, rawRef.current[k] ?? ''] as const);
      const changes = snapshot.map(([k, r]) => {
        if (k.startsWith('a:')) return { key: k, value: r === '1' ? 1 : null };
        const c = checkScore(r, maxOf(k));
        return { key: k, value: c.state === 'ok' ? c.n : null };
      });
      let ok = false;
      const run = (async () => {
        setSending(true);
        try {
          const res = await fetch('/api/judge/sheet', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ groupId: group.id, half, changes, ...extra }),
          });
          if (res.status === 401) {
            setMode('auth');
            return;
          }
          const data = await res.json().catch(() => ({}));
          if (res.status === 423) {
            setMode('closed');
            setMessage(data.error ?? 'Judging is closed.');
            return;
          }
          setMode('ok');
          // 422 means the scores were saved but the group could not be marked complete.
          const applied = res.ok || res.status === 422;
          if (applied) {
            for (const [k, r] of snapshot) if ((rawRef.current[k] ?? '') === r) dirtyRef.current.delete(k);
          }
          if (!res.ok) setMessage(data.error ?? 'The server could not save this. Try again.');
          else if (data.refused?.length) setMessage(`Some scores were refused: ${data.refused.map((x: { message: string }) => x.message).join(' ')}`);
          else setMessage(null);
          if (res.ok && data.status) setComplete(data.status === 'complete');
          ok = res.ok;
        } catch {
          setMode('offline');
        } finally {
          setSending(false);
          persist();
          rerender();
        }
      })();
      inflight.current = run;
      await run;
      inflight.current = null;
      return ok;
    },
    [group.id, half, maxOf, persist, props.closed],
  );

  // Send in the background: shortly after typing stops, every few seconds while anything waits,
  // when the page comes back into view, and when the browser says it is online again.
  useEffect(() => {
    const tick = setInterval(() => {
      if (dirtyRef.current.size) void send();
    }, 5000);
    const wake = () => {
      if (document.visibilityState === 'visible' && dirtyRef.current.size) void send();
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    if (dirtyRef.current.size) void send();
    return () => {
      clearInterval(tick);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [send]);

  const onType = (key: string, value: string) => {
    rawRef.current[key] = value;
    dirtyRef.current.add(key);
    persist();
    rerender();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void send(), 700);
  };

  const locked = complete || props.closed;

  // ── statistics ──────────────────────────────────────────────
  const catStats = (cat: Category) => {
    let filled = 0,
      errors = 0,
      sum = 0,
      scoredMax = 0;
    const errs: Issue[] = [],
      blanks: Issue[] = [],
      warns: Issue[] = [];
    cat.maxes.forEach((m, i) => {
      const k = critKey(cat.key, i);
      const raw = rawRef.current[k];
      const c = checkScore(raw, m);
      // Review lists stay short even when the coordinator has entered long criterion wording.
      const full = criterionLabel(cat, i);
      const label = cat.criteria?.[i] ? `${i + 1}. ${full.length > 48 ? `${full.slice(0, 46)}…` : full}` : full;
      if (c.state === 'ok') {
        filled++;
        sum += c.n;
        scoredMax += m;
        if (c.n === 0) warns.push({ t: 'w', key: k, text: `${label} is 0. Intended?` });
      } else if (c.state === 'error') {
        errors++;
        errs.push({ t: 'e', key: k, text: `${label}: ${raw} is over the max of ${m}` });
      } else blanks.push({ t: 'b', key: k, text: `${label} is blank` });
    });
    return { filled, total: cat.maxes.length, errors, sum, scoredMax, max: categoryMax(cat), issues: [...errs, ...blanks, ...warns] };
  };
  const memberStats = () => {
    let filled = 0,
      total = 0,
      errors = 0,
      done = 0;
    const issues: Issue[] = [];
    for (const m of members) {
      // A member marked absent from the defense needs no scores.
      if (rawRef.current[absentKey(m.id)] === '1') {
        done++;
        continue;
      }
      let ok = 0;
      for (const f of rubric.memberFields) {
        total++;
        const k = memberKey(m.id, f.key);
        const raw = rawRef.current[k];
        const c = checkScore(raw, f.max);
        if (c.state === 'ok') {
          filled++;
          ok++;
        } else if (c.state === 'error') {
          errors++;
          issues.push({ t: 'e', key: k, text: `${m.name}: ${f.name} ${raw} is over ${f.max}` });
        } else issues.push({ t: 'b', key: k, text: `${m.name}: ${f.name} blank` });
      }
      if (ok === rubric.memberFields.length) done++;
    }
    issues.sort((a, b) => (a.t === 'e' ? 0 : 1) - (b.t === 'e' ? 0 : 1));
    return { filled, total, errors, done, count: members.length, issues };
  };
  const totals = () => {
    let errors = 0,
      blanks = 0;
    halfDef.categories.forEach((c) => {
      const x = catStats(c);
      errors += x.errors;
      blanks += x.total - x.filled - x.errors;
    });
    if (half === 'defense') {
      const ms = memberStats();
      errors += ms.errors;
      blanks += ms.total - ms.filled - ms.errors;
    }
    return { errors, blanks };
  };

  const idx = steps.findIndex((s) => s.key === stepKey);
  const cur = steps[idx];
  const prev = steps[idx - 1];
  const next = steps[idx + 1];

  const goStep = (key: string, focusKey?: string) => {
    focusRef.current = focusKey ?? null;
    setStepKey(key);
    if (!focusKey) window.scrollTo({ top: 0 });
  };

  useLayoutEffect(() => {
    document.querySelector('.steps .current')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    const f = focusRef.current;
    if (!f) return;
    focusRef.current = null;
    const el = f === '__first' ? document.querySelector<HTMLInputElement>('#sheet-body input[data-key]') : document.querySelector<HTMLInputElement>(`input[data-key="${CSS.escape(f)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.focus({ preventScroll: true });
    }
  }, [stepKey]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const inputs = [...document.querySelectorAll<HTMLInputElement>('#sheet-body input[data-key]')];
    const i = inputs.indexOf(e.currentTarget);
    if (i < inputs.length - 1) inputs[i + 1].focus();
    else if (next) goStep(next.key, '__first');
  };

  // ── pieces ──────────────────────────────────────────────────
  const badgeFor = (s: Step) => {
    if (s.kind === 'cat') {
      const x = catStats(s.cat);
      return x.errors ? { cls: 'err', badge: '!' } : x.filled === x.total ? { cls: 'done', badge: '✓' } : { cls: '', badge: `${x.filled}/${x.total}` };
    }
    if (s.kind === 'members') {
      const x = memberStats();
      return x.errors ? { cls: 'err', badge: '!' } : x.done === x.count ? { cls: 'done', badge: '✓' } : { cls: '', badge: `${x.done}/${x.count}` };
    }
    const t = totals();
    return t.errors ? { cls: 'err', badge: String(t.errors + t.blanks) } : !t.blanks ? { cls: 'done', badge: '✓' } : { cls: '', badge: String(t.blanks) };
  };

  const scoreInput = (key: string, max: number, label: string) => (
    <input
      type="text"
      inputMode="decimal"
      enterKeyHint="next"
      autoComplete="off"
      spellCheck={false}
      placeholder="–"
      aria-label={`${label}, out of ${max}`}
      data-key={key}
      value={rawRef.current[key] ?? ''}
      readOnly={locked}
      onChange={(e) => onType(key, e.target.value)}
      onKeyDown={onKeyDown}
    />
  );

  const pendingCount = dirtyRef.current.size;
  let syncCls = 'sync';
  let syncText = 'All saved';
  if (mode === 'closed') {
    syncCls += ' pending';
    syncText = 'Judging closed';
  } else if (mode === 'auth') {
    syncCls += ' pending';
    syncText = `Sign in to send ${pendingCount}`;
  } else if (mode === 'offline' && pendingCount) {
    syncCls += ' pending';
    syncText = `Offline · ${pendingCount} kept on phone`;
  } else if (pendingCount || sending) {
    syncCls += ' pending';
    syncText = pendingCount ? `Sending ${pendingCount}…` : 'Sending…';
  }

  const banners = (
    <>
      {mode === 'offline' && pendingCount ? (
        <div className="banner offline" role="status">
          <b>●</b>
          <div>
            <b>No connection.</b> Keep scoring. {pendingCount} score{pendingCount === 1 ? '' : 's'} saved on this phone and will send by themselves when you are back online.
          </div>
        </div>
      ) : null}
      {mode === 'auth' ? (
        <div className="banner offline" role="status">
          <b>●</b>
          <div>
            <b>Your sign-in has ended.</b> {pendingCount} score{pendingCount === 1 ? ' is' : 's are'} kept on this phone. <Link href="/login">Sign in again</Link>, then reopen this group and they will send.
          </div>
        </div>
      ) : null}
      {message ? (
        <div className="banner err" role="alert">
          <b>!</b>
          <div>{message}</div>
        </div>
      ) : null}
      {props.closed ? (
        <div className="banner done">
          <b>✓</b>
          <div>
            <b>Judging is closed.</b> These scores are read-only.
          </div>
        </div>
      ) : complete ? (
        <div className="banner done">
          <b>✓</b>
          <div>
            <b>Marked complete.</b> Scores are locked against accidental taps.{' '}
            <button className="go" onClick={() => void send({ complete: false })}>
              Edit scores
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  let body: React.ReactNode;
  if (cur.kind === 'cat') {
    const st = cur.cat;
    const x = catStats(st);
    body = (
      <>
        {banners}
        <div className="cathead">
          <div>
            <div className="eyebrow">
              Step {idx + 1} of {steps.length}
            </div>
            <h2>{st.name}</h2>
            <div className="sub">
              {st.maxes.length} criteria · {x.max} points
            </div>
          </div>
          <div className="subtotal">
            <b>{fmtScore(x.sum)}</b> / {x.max}
            <div className="sub">
              {x.filled} of {x.total} scored
            </div>
          </div>
        </div>
        {st.maxes.map((m, i) => {
          const k = critKey(st.key, i);
          const c = checkScore(rawRef.current[k], m);
          const label = criterionLabel(st, i);
          return (
            <div key={k} className={`crit${c.state === 'ok' ? ' filled' : ''}${c.state === 'error' ? ' error' : ''}`}>
              <span className="num">{i + 1}</span>
              <div className="label">{label}</div>
              <div className="scorebox">
                {scoreInput(k, m, `${st.name}, ${label}`)}
                <span className="max">/{m}</span>
              </div>
              {c.state === 'error' ? <div className="msg">{c.msg}</div> : null}
              {c.state === 'ok' && c.n === 0 ? <div className="hint">0 points. Intended?</div> : null}
            </div>
          );
        })}
      </>
    );
  } else if (cur.kind === 'members') {
    const ms = memberStats();
    body = (
      <>
        {banners}
        <div className="cathead">
          <div>
            <div className="eyebrow">
              Step {idx + 1} of {steps.length}
            </div>
            <h2>Members</h2>
            <div className="sub">{rubric.memberFields.map((f) => `${f.name} /${f.max}`).join(' · ')}</div>
          </div>
          <div className="subtotal">
            <b>{ms.done}</b> / {ms.count}
            <div className="sub">fully scored</div>
          </div>
        </div>
        {!members.length ? <div className="banner offline">This group has no members yet. The coordinator adds them from the class roll.</div> : null}
        {members.map((m) => {
          const absent = rawRef.current[absentKey(m.id)] === '1';
          const absentButton = (
            <button className="go" disabled={locked} onClick={() => onType(absentKey(m.id), absent ? '' : '1')}>
              {absent ? 'Not absent' : 'Absent'}
            </button>
          );
          if (absent) {
            return (
              <div className="member absent" key={m.id}>
                <div className="mhead">
                  <span className="avatar">{m.initials}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="mname">{m.name}</div>
                    <div className="sub">Absent from the defense. No scores needed; the coordinator gives their grade.</div>
                  </div>
                  <div className="mtotal">{absentButton}</div>
                </div>
              </div>
            );
          }
          let tot = 0,
            any = false;
          rubric.memberFields.forEach((f) => {
            const c = checkScore(rawRef.current[memberKey(m.id, f.key)], f.max);
            if (c.state === 'ok') {
              tot += c.n;
              any = true;
            }
          });
          return (
            <div className="member" key={m.id}>
              <div className="mhead">
                <span className="avatar">{m.initials}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="mname">{m.name}</div>
                  <div className="sub">Class roll · {m.section}</div>
                </div>
                <div className="mtotal">
                  <b>{any ? fmtScore(tot) : '–'}</b>
                  <span className="sub"> / 100</span>
                  <div>{absentButton}</div>
                </div>
              </div>
              <div className="mfields">
                {rubric.memberFields.map((f) => {
                  const k = memberKey(m.id, f.key);
                  const c = checkScore(rawRef.current[k], f.max);
                  return (
                    <div key={k} className={`mfield${c.state === 'error' ? ' error' : ''}`}>
                      <label>{f.name}</label>
                      <div className="scorebox">
                        {scoreInput(k, f.max, `${m.name}, ${f.name}`)}
                        <span className="max">/{f.max}</span>
                      </div>
                      {c.state === 'error' ? <div className="msg">{c.msg}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  } else {
    const t = totals();
    const can = !t.errors && !t.blanks;
    const left = [t.errors ? `${t.errors} to fix` : '', t.blanks ? `${t.blanks} blank` : ''].filter(Boolean).join(' · ');
    const icon = { err: '!', ok: '✓', none: '–', part: '…' } as const;
    body = (
      <>
        {banners}
        <div className="rhead">
          <div className="eyebrow">Review · {halfDef.label}</div>
          <h2>{group.name}</h2>
          <div className="sub">Your own scores only. Final results average every judge who scored this group.</div>
        </div>
        <ul className="rlist">
          {halfDef.categories.map((st) => {
            const x = catStats(st);
            const state = x.errors ? 'err' : x.filled === x.total ? 'ok' : x.filled === 0 ? 'none' : 'part';
            // Blanks are left out, never counted as zero (decision 1), with the same two-decimal rounding as results.
            const pct = x.filled ? fmtPct((x.sum / x.scoredMax) * 100) : '–';
            const issues = x.filled === 0 && !x.errors ? [{ t: 'b' as const, key: critKey(st.key, 0), text: `Not started · ${x.total} blank` }] : x.issues;
            return (
              <li key={st.key} className={`ritem ${state}`}>
                <span className="ricon">{icon[state]}</span>
                <div>
                  <div className="rname">{st.name}</div>
                  <div className="sub">
                    {x.filled} of {x.total} scored · {fmtScore(x.sum)} / {x.max}
                  </div>
                </div>
                <span className="rpct">{pct}</span>
                {issues.length ? (
                  <ul className="issues">
                    {issues.map((it) => (
                      <li key={it.key + it.t} className={it.t}>
                        <span>{it.text}</span>
                        <button className="go" onClick={() => goStep(st.key, it.key)}>
                          Go
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
          {half === 'defense'
            ? (() => {
                const ms = memberStats();
                const state = ms.errors ? 'err' : ms.done === ms.count ? 'ok' : ms.filled === 0 ? 'none' : 'part';
                const shown = ms.issues.slice(0, 4);
                return (
                  <li className={`ritem ${state}`}>
                    <span className="ricon">{icon[state]}</span>
                    <div>
                      <div className="rname">Members</div>
                      <div className="sub">
                        {ms.done} of {ms.count} fully scored
                      </div>
                    </div>
                    <span className="rpct" />
                    {shown.length ? (
                      <ul className="issues">
                        {shown.map((it) => (
                          <li key={it.key} className={it.t}>
                            <span>{it.text}</span>
                            <button className="go" onClick={() => goStep('members', it.key)}>
                              Go
                            </button>
                          </li>
                        ))}
                        {ms.issues.length > 4 ? (
                          <li>
                            <span>and {ms.issues.length - 4} more</span>
                            <span />
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </li>
                );
              })()
            : null}
        </ul>
        {props.closed ? null : complete ? (
          <>
            <button className="secondary" onClick={() => void send({ complete: false })}>
              Edit scores
            </button>
            <div className="note">Marked complete. You can still change scores until the coordinator closes judging.</div>
          </>
        ) : (
          <>
            <button className="primary" disabled={!can} onClick={() => void send({ complete: true })}>
              Mark group complete
            </button>
            <div className="note">{can ? 'Everything is filled in.' : `${left} left. Every score is already saved as you type.`}</div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <header className="appbar">
        <Link href={`/judge?half=${half}`} className="brand">
          {props.eventTitle}
          <small>Judge scoring</small>
        </Link>
        <div className="spacer" />
        <span className="who">{props.judgeName}</span>
        <span className={syncCls} role="status" aria-live="polite">
          <span className="dot" />
          {syncText}
        </span>
      </header>
      <div className={`pane-sheet half-${half}`}>
        <div className="ghead">
          <div className="ghead-inner">
            <div className="ghead-row">
              <Link className="back" href={`/judge?half=${half}`} aria-label="Back to groups">
                ‹ Groups
              </Link>
              <div className="gtitle">
                <div className="gmeta">
                  {group.section} · {group.adviser}
                </div>
                <h1>{group.name}</h1>
              </div>
              <span className="halfpill">{halfDef.label}</span>
            </div>
            <nav className="steps" aria-label="Scoring steps">
              {steps.map((s) => {
                const b = badgeFor(s);
                const isCur = s.key === stepKey;
                return (
                  <button key={s.key} className={`step ${b.cls}${isCur ? ' current' : ''}`} aria-current={isCur ? 'step' : undefined} onClick={() => goStep(s.key)}>
                    {s.name} <span className="badge">{b.badge}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
        <div className="sheet-body" id="sheet-body">
          {body}
        </div>
        <div className="bottomnav">
          <div className="bottomnav-inner">
            <button className="navbtn" disabled={!prev} onClick={() => prev && goStep(prev.key)}>
              ‹ {prev ? prev.name : 'Back'}
            </button>
            {next ? (
              <button className="navbtn next" onClick={() => goStep(next.key)}>
                {next.name} ›
              </button>
            ) : (
              <Link className="navbtn next" href={`/judge?half=${half}`}>
                All groups
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Half } from '@/lib/rubric';
import { readDraft } from './draft';

export interface JudgeGroup {
  id: string;
  name: string;
  section: string;
  adviser: string;
  defense: { filled: number; total: number; complete: boolean };
  booth: { filled: number; total: number; complete: boolean };
}

type Cls = 'none' | 'part' | 'err' | 'done';

export function GroupList({ judgeId, groups }: { judgeId: string; groups: JudgeGroup[] }) {
  const [half, setHalf] = useState<Half>('defense');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'none' | 'part' | 'done'>('all');
  const [drafts, setDrafts] = useState<Record<string, { unsent: number; errors: number }>>({});

  useEffect(() => {
    const url = new URL(window.location.href);
    const h = url.searchParams.get('half') ?? localStorage.getItem('tambiz:half');
    if (h === 'booth' || h === 'defense') setHalf(h);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('tambiz:half', half);
    } catch {}
    const next: typeof drafts = {};
    for (const g of groups) {
      const d = readDraft(judgeId, g.id, half);
      if (d) next[g.id] = { unsent: d.dirty.length, errors: d.errors ?? 0 };
    }
    setDrafts(next);
  }, [half, groups, judgeId]);

  const rows = useMemo(
    () =>
      groups.map((g) => {
        const s = g[half];
        const d = drafts[g.id];
        let cls: Cls;
        let label: string;
        if (s.complete) {
          cls = 'done';
          label = '✓ Complete';
        } else if (d?.errors) {
          cls = 'err';
          label = `${s.filled}/${s.total} · fix ${d.errors}`;
        } else if (s.filled === 0 && !d?.unsent) {
          cls = 'none';
          label = 'Not started';
        } else {
          cls = 'part';
          label = `${s.filled}/${s.total}`;
        }
        return { g, cls, label, unsent: d?.unsent ?? 0 };
      }),
    [groups, half, drafts],
  );
  const counts = { none: 0, part: 0, done: 0 };
  rows.forEach((r) => (r.cls === 'done' ? counts.done++ : r.cls === 'none' ? counts.none++ : counts.part++));
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (filter === 'all' || r.cls === filter || (filter === 'part' && r.cls === 'err')) &&
      (!needle || `${r.g.name} ${r.g.section} ${r.g.adviser}`.toLowerCase().includes(needle)),
  );

  return (
    <div className={`half-${half}`}>
      <div className="gp-head">
        <div className="gp-inner">
          <div className="eyebrow">I am scoring</div>
          <div className="seg" role="group" aria-label="Judging half">
            {(['defense', 'booth'] as Half[]).map((h) => (
              <button key={h} data-half={h} className={half === h ? 'on' : ''} aria-pressed={half === h} onClick={() => setHalf(h)}>
                {h === 'defense' ? 'Defense' : 'Booth'}
              </button>
            ))}
          </div>
          <input className="search" type="search" placeholder="Search group, section or adviser" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label="Search groups" />
          <div className="filters">
            {(
              [
                ['all', 'All', groups.length],
                ['none', 'Not started', counts.none],
                ['part', 'In progress', counts.part],
                ['done', 'Complete', counts.done],
              ] as const
            ).map(([k, l, n]) => (
              <button key={k} className={`fchip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
                {l} {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ul className="glist">
        {shown.map(({ g, cls, label, unsent }) => (
          <li key={g.id}>
            <Link className="grow" href={`/judge/score/${g.id}?half=${half}`}>
              <span style={{ minWidth: 0 }}>
                <span className="gname">{g.name}</span>
                <span className="gmeta">
                  {g.section} · {g.adviser}
                  {unsent ? ` · ${unsent} not sent yet` : ''}
                </span>
              </span>
              <span className={`status ${cls}`}>{label}</span>
            </Link>
          </li>
        ))}
        {!shown.length ? <li className="note" style={{ padding: 20 }}>No groups match.</li> : null}
      </ul>
    </div>
  );
}

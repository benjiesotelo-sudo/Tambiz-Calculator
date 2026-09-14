// Coordinator corrections that removed a score (decision 7). Removing a score deletes its stored value, so what the
// judge gave, and why it was removed, is read back from the change log: the coordinator's 'score.correct' entries and
// the judges' own 'scores' saves, oldest first. A judge's own later entry in a box ends the coordinator's correction.

export interface CorrectionLogEntry {
  action: string;
  createdAt: Date;
  who: string | null;
  detail: {
    sheet?: string;
    key?: string;
    from?: number | null;
    to?: number | null;
    reason?: string;
    changes?: { key?: unknown }[];
  };
}

export interface RemovedScore {
  /** The judge's own value before the coordinator's first correction; null if the judge left it blank. */
  judgeValue: number | null;
  /** The value just before it was removed, which may itself be an earlier correction. */
  previous: number | null;
  reason: string;
  correctedByName: string | null;
  correctedAt: Date;
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Boxes whose latest change was the coordinator removing the score: sheet id → box key (c:… or m:…) → the removal. */
export function removedByCoordinator(entries: CorrectionLogEntry[]): Map<string, Map<string, RemovedScore>> {
  const latest = new Map<string, Map<string, RemovedScore & { to: number | null }>>();
  const boxes = (sheet: string) => latest.get(sheet) ?? latest.set(sheet, new Map()).get(sheet)!;
  for (const e of entries) {
    const sheet = e.detail.sheet;
    if (!sheet) continue;
    if (e.action === 'scores') {
      for (const ch of e.detail.changes ?? []) latest.get(sheet)?.delete(String(ch.key));
    } else if (e.action === 'score.correct' && e.detail.key) {
      const earlier = boxes(sheet).get(e.detail.key);
      boxes(sheet).set(e.detail.key, {
        judgeValue: earlier ? earlier.judgeValue : num(e.detail.from),
        previous: num(e.detail.from),
        to: num(e.detail.to),
        reason: e.detail.reason ?? '',
        correctedByName: e.who,
        correctedAt: new Date(e.createdAt),
      });
    }
  }
  const out = new Map<string, Map<string, RemovedScore>>();
  for (const [sheet, byKey] of latest) {
    for (const [key, { to, ...removed }] of byKey) {
      if (to !== null) continue;
      if (!out.has(sheet)) out.set(sheet, new Map());
      out.get(sheet)!.set(key, removed);
    }
  }
  return out;
}

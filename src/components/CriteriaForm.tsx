'use client';

// The Scoring sheet screen's wording form. One box per criterion, with its points beside it.
// Pasting several lines into any box fills that box and the ones after it, in sheet order.

import { useEffect, useMemo, useState } from 'react';
import { saveCriteria } from '@/app/admin/actions';
import { categoryMax, HALVES, MAX_WORDING, splitPastedLines, wordingField, type Rubric } from '@/lib/rubric';

export function CriteriaForm({ eventId, rubric }: { eventId: string; rubric: Rubric }) {
  const fields = useMemo(
    () =>
      HALVES.flatMap((half) =>
        rubric.halves[half].categories.flatMap((cat) => cat.maxes.map((max, i) => ({ name: wordingField(half, cat.key, i), initial: cat.criteria?.[i] ?? '', max }))),
      ),
    [rubric],
  );
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.initial])));
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (name: string, v: string) => {
    setValues((old) => ({ ...old, [name]: v }));
    setDirty(true);
  };

  const onPaste = (name: string, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const lines = splitPastedLines(e.clipboardData.getData('text'));
    if (lines.length < 2) return;
    e.preventDefault();
    const start = fields.findIndex((f) => f.name === name);
    const next = { ...values };
    const used = Math.min(lines.length, fields.length - start);
    for (let k = 0; k < used; k++) next[fields[start + k].name] = lines[k].slice(0, MAX_WORDING);
    setValues(next);
    setDirty(true);
    const left = lines.length - used;
    setNote(`Filled ${used} box${used === 1 ? '' : 'es'} from your paste${left ? `; ${left} line${left === 1 ? ' was' : 's were'} left over and not used` : ''}. Check them, then press Save wording.`);
  };

  const filled = fields.filter((f) => values[f.name]?.trim()).length;

  return (
    <form action={saveCriteria} onSubmit={() => setDirty(false)}>
      <input type="hidden" name="eventId" value={eventId} />
      {HALVES.map((half) => (
        <div key={half} className={`half-${half}`}>
          <div className="section-title">
            {rubric.halves[half].label} · {rubric.halves[half].categories.reduce((n, c) => n + c.maxes.length, 0)} criteria
          </div>
          {rubric.halves[half].categories.map((cat) => (
            <div key={cat.key} className="card">
              <h3>{cat.name}</h3>
              <div className="sub">
                {cat.maxes.length} criteria · {categoryMax(cat)} points
              </div>
              {cat.maxes.map((max, i) => {
                const name = wordingField(half, cat.key, i);
                return (
                  <div key={name} className="wording">
                    <span className="num">{i + 1}</span>
                    <textarea
                      className="input"
                      name={name}
                      rows={2}
                      maxLength={MAX_WORDING}
                      placeholder={`Criterion ${i + 1}`}
                      aria-label={`${cat.name}, criterion ${i + 1}, worth ${max} points`}
                      value={values[name] ?? ''}
                      onChange={(e) => set(name, e.target.value)}
                      onPaste={(e) => onPaste(name, e)}
                    />
                    <span className="max">/{max}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
      <div className="savebar">
        <div className="savebar-inner">
          <span className="sub" role="status">
            {note ?? `${filled} of ${fields.length} criteria have wording${dirty ? ' · not saved yet' : ''}`}
          </span>
          <button className="btn" type="submit">
            Save wording
          </button>
        </div>
      </div>
    </form>
  );
}

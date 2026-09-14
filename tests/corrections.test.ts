// Decision 7: a score the coordinator removed still shows what the judge gave and why, read back from the change log.
import { describe, expect, it } from 'vitest';
import { removedByCoordinator, type CorrectionLogEntry } from '@/lib/corrections';

let t = 0;
const correct = (sheet: string, key: string, from: number | null, to: number | null, reason = 'Checked with the judge'): CorrectionLogEntry => ({
  action: 'score.correct',
  createdAt: new Date(Date.UTC(2027, 4, 1, 0, 0, t++)),
  who: 'Tambiz Coordinator',
  detail: { group: 'g1', half: 'defense', sheet, key, label: 'Elevator Pitch 1', from, to, reason } as CorrectionLogEntry['detail'],
});
const judgeSaves = (sheet: string, key: string, value: number | null): CorrectionLogEntry => ({
  action: 'scores',
  createdAt: new Date(Date.UTC(2027, 4, 1, 0, 0, t++)),
  who: 'Judge',
  detail: { sheet, changes: [{ key, value } as { key: string }] },
});

describe('scores removed by the coordinator', () => {
  it('a removed score keeps the judge’s value and the reason', () => {
    const removed = removedByCoordinator([correct('s1', 'c:ep:0', 18, null, 'Judge scored the wrong group')]);
    expect(removed.get('s1')?.get('c:ep:0')).toMatchObject({ judgeValue: 18, previous: 18, reason: 'Judge scored the wrong group', correctedByName: 'Tambiz Coordinator' });
  });

  it('after an earlier correction, the judge’s own value is still the one from before the first correction', () => {
    const removed = removedByCoordinator([correct('s1', 'c:ep:0', 13, 18), correct('s1', 'c:ep:0', 18, null)]);
    expect(removed.get('s1')?.get('c:ep:0')).toMatchObject({ judgeValue: 13, previous: 18 });
  });

  it('a score put back by the coordinator, or entered again by the judge, is no longer shown as removed', () => {
    expect(removedByCoordinator([correct('s1', 'c:ep:0', 18, null), correct('s1', 'c:ep:0', null, 15)]).size).toBe(0);
    expect(removedByCoordinator([correct('s1', 'c:ep:0', 18, null), judgeSaves('s1', 'c:ep:0', 16)]).size).toBe(0);
  });

  it('a judge’s save of another box, or on another sheet, leaves the removal in place', () => {
    const removed = removedByCoordinator([correct('s1', 'm:stu1:qa', 8, null), judgeSaves('s1', 'c:ep:0', 16), judgeSaves('s2', 'm:stu1:qa', 9)]);
    expect([...(removed.get('s1')?.keys() ?? [])]).toEqual(['m:stu1:qa']);
  });

  it('a judge who enters the score again after an earlier removal starts a fresh record', () => {
    const removed = removedByCoordinator([correct('s1', 'c:ep:0', 18, null), judgeSaves('s1', 'c:ep:0', 12), correct('s1', 'c:ep:0', 12, null)]);
    expect(removed.get('s1')?.get('c:ep:0')).toMatchObject({ judgeValue: 12, previous: 12 });
  });
});

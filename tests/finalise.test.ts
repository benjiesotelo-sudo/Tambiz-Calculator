// Decisions 5 and 6: what blocks closing the event, and what is only a warning.
import { describe, expect, it } from 'vitest';
import { finaliseChecks, type FinaliseInput } from '@/lib/finalise';

const base = (): FinaliseInput => ({
  halfLabel: { defense: 'Defense', booth: 'Booth' },
  groups: [{ id: 'g1', name: 'Kape Kultura', acceptReason: null, complete: true }],
  sheets: [
    { groupId: 'g1', half: 'defense', status: 'complete', judgeName: 'A', filled: 21 },
    { groupId: 'g1', half: 'defense', status: 'complete', judgeName: 'B', filled: 21 },
    { groupId: 'g1', half: 'booth', status: 'complete', judgeName: 'C', filled: 18 },
    { groupId: 'g1', half: 'booth', status: 'complete', judgeName: 'A', filled: 18 },
  ],
  members: [{ studentId: 's1', name: 'Andrea Dela Cruz', groupId: 'g1', absent: false, memberComplete: true }],
});

describe('finalising', () => {
  it('a fully judged event has nothing in the way', () => {
    expect(finaliseChecks(base())).toEqual({ blockers: [], warnings: [], decided: [] });
  });

  it('a group without a completed booth sheet blocks finalising', () => {
    const x = base();
    x.sheets = x.sheets.filter((s) => s.half !== 'booth');
    x.groups[0].complete = false;
    expect(finaliseChecks(x).blockers.map((b) => b.text)).toEqual(['Kape Kultura: no completed Booth sheet.']);
  });

  it('the coordinator can accept it with a reason, which is then shown rather than blocking', () => {
    const x = base();
    x.sheets = x.sheets.filter((s) => s.half !== 'booth');
    x.groups[0] = { ...x.groups[0], complete: false, acceptReason: 'Did not run a booth' };
    const c = finaliseChecks(x);
    expect(c.blockers).toEqual([]);
    expect(c.decided[0].text).toMatch(/no completed Booth sheet.*Did not run a booth/);
  });

  it('a half with only one completed sheet is a warning, not a blocker', () => {
    const x = base();
    x.sheets = x.sheets.filter((s) => !(s.half === 'booth' && s.judgeName === 'A'));
    const c = finaliseChecks(x);
    expect(c.blockers).toEqual([]);
    expect(c.warnings.map((w) => w.text)).toEqual(['Kape Kultura: only one completed Booth sheet.']);
  });

  it('a sheet still in progress is a warning that says its scores do not count (before: "still count")', () => {
    const x = base();
    x.sheets.push({ groupId: 'g1', half: 'defense', status: 'in_progress', judgeName: 'C', filled: 4 });
    expect(finaliseChecks(x).warnings[0].text).toBe('Kape Kultura: C has not submitted their Defense sheet (marked it complete). None of its scores count until they do.');
  });

  it('a half whose only sheet is in progress has no completed sheet, so it blocks', () => {
    const x = base();
    x.sheets = [...x.sheets.filter((s) => s.half !== 'booth'), { groupId: 'g1', half: 'booth', status: 'in_progress', judgeName: 'C', filled: 18 }];
    x.groups[0].complete = false;
    expect(finaliseChecks(x).blockers.map((b) => b.text)).toEqual(['Kape Kultura: no completed Booth sheet.']);
  });

  it('a member with incomplete individual scores blocks until scored or marked absent', () => {
    const x = base();
    x.members[0].memberComplete = false;
    expect(finaliseChecks(x).blockers[0].text).toBe('Andrea Dela Cruz (Kape Kultura) has incomplete individual scores.');
    x.members[0].absent = true;
    const c = finaliseChecks(x);
    expect(c.blockers).toEqual([]);
    expect(c.decided[0].text).toMatch(/marked absent from the defense, so their individual scores count as zero/);
  });
});

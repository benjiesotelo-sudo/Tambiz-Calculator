// Decisions 5 and 6: what blocks finalising, and what is only a warning.
import { describe, expect, it } from 'vitest';
import { finaliseChecks, releaseRefusal, type FinaliseInput } from '@/lib/finalise';

const base = (): FinaliseInput => ({
  halfLabel: { defense: 'Defense', booth: 'Booth' },
  groups: [{ id: 'g1', code: 'G01', name: 'Kape Kultura', acceptReason: null, complete: true }],
  sheets: [
    { groupId: 'g1', half: 'defense', status: 'complete', judgeName: 'A', filled: 21 },
    { groupId: 'g1', half: 'defense', status: 'complete', judgeName: 'B', filled: 21 },
    { groupId: 'g1', half: 'booth', status: 'complete', judgeName: 'C', filled: 18 },
    { groupId: 'g1', half: 'booth', status: 'complete', judgeName: 'A', filled: 18 },
  ],
  members: [{ studentId: 's1', name: 'Andrea Dela Cruz', groupId: 'g1', absent: false, memberComplete: true }],
  unplaced: [],
});

describe('finalising', () => {
  it('a fully judged event has nothing in the way', () => {
    expect(finaliseChecks(base())).toEqual({ blockers: [], warnings: [], decided: [] });
  });

  it('a group without a completed booth sheet blocks finalising', () => {
    const x = base();
    x.sheets = x.sheets.filter((s) => s.half !== 'booth');
    x.groups[0].complete = false;
    expect(finaliseChecks(x).blockers.map((b) => b.text)).toEqual(['G01 Kape Kultura: no completed Booth sheet.']);
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
    expect(c.warnings.map((w) => w.text)).toEqual(['G01 Kape Kultura: only one completed Booth sheet.']);
  });

  it('a sheet still in progress is a warning', () => {
    const x = base();
    x.sheets.push({ groupId: 'g1', half: 'defense', status: 'in_progress', judgeName: 'C', filled: 4 });
    expect(finaliseChecks(x).warnings[0].text).toMatch(/C has not marked Defense complete/);
  });

  it('a student in no group blocks until placed or left out with a reason', () => {
    const x = base();
    x.unplaced = [{ studentId: 's9', name: 'Miguel Santos', section: 'BA-3A', excludedReason: null }];
    expect(finaliseChecks(x).blockers).toHaveLength(1);
    x.unplaced[0].excludedReason = 'Dropped the course';
    expect(finaliseChecks(x).blockers).toHaveLength(0);
  });

  it('release is refused while anything blocks, with the count and where to find the items, and allowed once settled', () => {
    const x = base();
    expect(releaseRefusal(finaliseChecks(x))).toBeNull();
    x.groups[0].complete = false;
    expect(releaseRefusal(finaliseChecks(x))).toBe('Results cannot be released yet: 1 item needs you first. They are listed under Close judging on the Progress tab.');
    x.unplaced = [{ studentId: 's9', name: 'Miguel Santos', section: 'BA-3A', excludedReason: null }];
    expect(releaseRefusal(finaliseChecks(x))).toMatch(/^Results cannot be released yet: 2 items need you first\./);
    x.groups[0].acceptReason = 'Did not run a booth';
    x.unplaced[0].excludedReason = 'Dropped the course';
    expect(releaseRefusal(finaliseChecks(x))).toBeNull();
  });

  it('a member with incomplete member scores blocks until scored or marked absent', () => {
    const x = base();
    x.members[0].memberComplete = false;
    expect(finaliseChecks(x).blockers[0].text).toBe('Andrea Dela Cruz (G01) has incomplete member scores.');
    x.members[0].absent = true;
    const c = finaliseChecks(x);
    expect(c.blockers).toEqual([]);
    expect(c.decided[0].text).toMatch(/marked absent/);
  });
});

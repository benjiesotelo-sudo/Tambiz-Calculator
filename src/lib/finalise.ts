// What stands between an event and finalising (decisions 5 and 6). Pure, so the Progress page shows exactly
// the checks that the finalise action enforces.
//
// Blocking: a group without a completed sheet in each half, or with a criterion nobody scored, unless the coordinator
// accepted it with a reason; a student on the roll in no group and not left out with a reason; a group member whose
// member scores are incomplete and who is not marked absent.
// Not blocking, but shown: a half with only one completed sheet, sheets still in progress, accepted groups, absent
// members and students left out.

import { HALVES, type Half } from './rubric';

export interface FinaliseInput {
  halfLabel: Record<Half, string>;
  groups: { id: string; code: string; name: string; acceptReason: string | null; complete: boolean }[];
  sheets: { groupId: string; half: Half; status: 'in_progress' | 'complete'; judgeName: string; filled: number }[];
  members: { studentId: string; name: string; groupId: string; absent: boolean; memberComplete: boolean }[];
  unplaced: { studentId: string; name: string; section: string; excludedReason: string | null }[];
}

export interface Check {
  kind: 'group' | 'student' | 'member';
  /** Group id for 'group', student id otherwise. */
  id: string;
  text: string;
}

export interface FinaliseChecks {
  blockers: Check[];
  warnings: Check[];
  /** Plain facts the coordinator has already decided: accepted groups, absences, students left out. */
  decided: Check[];
}

export function finaliseChecks(input: FinaliseInput): FinaliseChecks {
  const blockers: Check[] = [];
  const warnings: Check[] = [];
  const decided: Check[] = [];
  const groupById = new Map(input.groups.map((g) => [g.id, g]));

  for (const g of input.groups) {
    const label = `${g.code} ${g.name}`;
    const missing: string[] = [];
    for (const half of HALVES) {
      const mine = input.sheets.filter((s) => s.groupId === g.id && s.half === half);
      const done = mine.filter((s) => s.status === 'complete').length;
      if (done === 0) missing.push(input.halfLabel[half]);
      else if (done === 1) warnings.push({ kind: 'group', id: g.id, text: `${label}: only one completed ${input.halfLabel[half]} sheet.` });
      for (const s of mine) {
        if (s.status !== 'complete' && s.filled > 0) {
          warnings.push({ kind: 'group', id: g.id, text: `${label}: ${s.judgeName} has not marked ${input.halfLabel[half]} complete. The scores typed so far still count.` });
        }
      }
    }
    if (!missing.length && g.complete) continue;
    const why = missing.length
      ? `no completed ${missing.join(' or ')} sheet`
      : 'a criterion nobody has scored';
    if (g.acceptReason) decided.push({ kind: 'group', id: g.id, text: `${label}: finalised with ${why}. Your reason: ${g.acceptReason}` });
    else blockers.push({ kind: 'group', id: g.id, text: `${label}: ${why}.` });
  }

  for (const s of input.unplaced) {
    if (s.excludedReason) decided.push({ kind: 'student', id: s.studentId, text: `${s.name} (${s.section}) is left out of every group. Your reason: ${s.excludedReason}` });
    else blockers.push({ kind: 'student', id: s.studentId, text: `${s.name} (${s.section}) is on the roll but in no group.` });
  }

  for (const m of input.members) {
    const group = groupById.get(m.groupId);
    const where = group ? ` (${group.code})` : '';
    if (m.absent) decided.push({ kind: 'member', id: m.studentId, text: `${m.name}${where} is marked absent from the defense. Their grade is left blank for you to enter.` });
    else if (!m.memberComplete) blockers.push({ kind: 'member', id: m.studentId, text: `${m.name}${where} has incomplete member scores.` });
  }

  return { blockers, warnings, decided };
}

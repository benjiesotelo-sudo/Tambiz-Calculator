// What stands between an event and closing it (decisions 5 and 6). Pure, so the Close screen shows exactly the checks
// that the close action enforces.
//
// Blocking: a group without a completed sheet in each half, or with a criterion nobody scored, unless the coordinator
// accepted it with a reason; a group member whose individual scores are incomplete and who is not marked absent.
// Not blocking, but shown: a half with only one completed sheet, sheets still in progress (which count for nothing),
// accepted groups and absent members.
// Every student is in a group (the workbook's Group column is required), so no student can be left out of one.

import { HALVES, type Half } from './rubric';

export interface FinaliseInput {
  halfLabel: Record<Half, string>;
  groups: { id: string; name: string; acceptReason: string | null; complete: boolean }[];
  sheets: { groupId: string; half: Half; status: 'in_progress' | 'complete'; judgeName: string; filled: number }[];
  members: { studentId: string; name: string; groupId: string; absent: boolean; memberComplete: boolean }[];
}

export interface Check {
  kind: 'group' | 'member';
  /** Group id for 'group', student id otherwise. */
  id: string;
  text: string;
}

export interface FinaliseChecks {
  blockers: Check[];
  warnings: Check[];
  /** Plain facts the coordinator has already decided: accepted groups and absences. */
  decided: Check[];
}

/** "1 item needs" / "3 items need". */
export const itemsNeedYou = (n: number) => `${n} item${n === 1 ? ' needs' : 's need'}`;

export function finaliseChecks(input: FinaliseInput): FinaliseChecks {
  const blockers: Check[] = [];
  const warnings: Check[] = [];
  const decided: Check[] = [];
  const groupById = new Map(input.groups.map((g) => [g.id, g]));

  for (const g of input.groups) {
    const label = g.name;
    const missing: string[] = [];
    for (const half of HALVES) {
      const mine = input.sheets.filter((s) => s.groupId === g.id && s.half === half);
      const done = mine.filter((s) => s.status === 'complete').length;
      if (done === 0) missing.push(input.halfLabel[half]);
      else if (done === 1) warnings.push({ kind: 'group', id: g.id, text: `${label}: only one completed ${input.halfLabel[half]} sheet.` });
      for (const s of mine) {
        if (s.status !== 'complete' && s.filled > 0) {
          warnings.push({ kind: 'group', id: g.id, text: `${label}: ${s.judgeName} has not submitted their ${input.halfLabel[half]} sheet (marked it complete). None of its scores count until they do.` });
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

  for (const m of input.members) {
    const group = groupById.get(m.groupId);
    const where = group ? ` (${group.name})` : '';
    if (m.absent) decided.push({ kind: 'member', id: m.studentId, text: `${m.name}${where} is marked absent from the defense, so their individual scores count as zero.` });
    else if (!m.memberComplete) blockers.push({ kind: 'member', id: m.studentId, text: `${m.name}${where} has incomplete individual scores.` });
  }

  return { blockers, warnings, decided };
}

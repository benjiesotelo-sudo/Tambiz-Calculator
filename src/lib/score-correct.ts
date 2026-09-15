// A coordinator's correction of one judge's score (decision 7), shared by the scores table and the older form.
// The judge's own value is kept from before the first correction, a reason is required, the change is recorded,
// and nothing can be corrected once results are released.

import { logStatement } from './change-log';
import { one, transaction } from './db';
import { removedScores, type EventRow } from './repo';
import { criterionLabel, findCriterion, type Half } from './rubric';
import { checkScore } from './sheet';

export type CorrectionResult =
  | { ok: true; group: string; half: Half; label: string; judge: string; from: number | null; to: number | null }
  | { ok: false; error: string; group?: string; half?: Half };

export async function applyCorrection(
  event: EventRow,
  accountId: string,
  sheetId: string,
  key: string,
  raw: string,
  reasonText: string,
  /** The group and half the correction was made on; a sheet from anywhere else is refused before anything is written. */
  expected?: { group: string; half: Half },
): Promise<CorrectionResult> {
  const sheet = await one<{ id: string; group_id: string; half: Half; judge_name: string }>(
    `SELECT s.id, s.group_id, s.half, a.display_name AS judge_name FROM score_sheet s JOIN account a ON a.id = s.judge_id WHERE s.id = $1 AND s.event_id = $2`,
    [sheetId, event.id],
  );
  if (!sheet) return { ok: false, error: 'Score sheet not found.' };
  const where = { group: sheet.group_id, half: sheet.half };
  if (expected && (expected.group !== sheet.group_id || expected.half !== sheet.half)) return { ok: false, ...where, error: 'That score belongs to another group.' };
  if (event.released_at) return { ok: false, ...where, error: 'Results have been released, so scores can no longer be corrected.' };
  const reason = reasonText.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (reason.length < 3) return { ok: false, ...where, error: 'Type a short reason for the correction, for example “Judge confirmed 18, typed 13”.' };

  const [kind, a, b] = key.split(':');
  let max: number | null = null;
  let label = '';
  if (kind === 'c') {
    const crit = findCriterion(event.rubric, sheet.half, `${a}:${b}`);
    if (crit) {
      max = crit.max;
      label = `${crit.category.name} ${crit.index + 1} (${criterionLabel(crit.category, crit.index)})`;
    }
  } else if (kind === 'm' && sheet.half === 'defense') {
    const field = event.rubric.memberFields.find((f) => f.key === b);
    const member = await one<{ first_name: string; surname: string }>(
      'SELECT s.first_name, s.surname FROM group_member m JOIN student s ON s.id = m.student_id WHERE m.group_id = $1 AND m.student_id = $2',
      [sheet.group_id, a],
    );
    if (field && member) {
      max = field.max;
      label = `${member.first_name} ${member.surname}, ${field.name}`;
    }
  }
  if (max === null) return { ok: false, ...where, error: 'Unknown score box.' };
  const check = checkScore(raw, max);
  if (check.state === 'error') return { ok: false, ...where, error: `${label}: ${check.msg}` };
  const to = check.state === 'ok' ? check.n : null;

  const table =
    kind === 'c'
      ? { name: 'score_value', where: 'sheet_id = $1 AND criterion_key = $2', ids: [sheet.id, `${a}:${b}`] }
      : { name: 'member_score', where: 'sheet_id = $1 AND student_id = $2 AND field = $3', ids: [sheet.id, a, b] };
  const current = await one<{ value: number; corrected_by: string | null; judge_value: number | null }>(`SELECT value, corrected_by, judge_value FROM ${table.name} WHERE ${table.where}`, table.ids);
  const from = current ? Number(current.value) : null;
  if (from === to) return { ok: false, ...where, error: `${label} is already ${to === null ? 'blank' : String(to)}.` };
  // The judge's own value is kept from before the first correction; later corrections leave it alone.
  const judgeValue = current ? (current.corrected_by ? current.judge_value : from) : ((await removedScores(event.id, [sheet.id])).get(sheet.id)?.get(key)?.judgeValue ?? null);

  const write =
    to === null
      ? { text: `DELETE FROM ${table.name} WHERE ${table.where}`, params: table.ids }
      : kind === 'c'
        ? {
            text: `INSERT INTO score_value (sheet_id, criterion_key, value, corrected_by, corrected_at, correction_reason, judge_value) VALUES ($1, $2, $3, $4, now(), $5, $6)
                   ON CONFLICT (sheet_id, criterion_key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), corrected_by = EXCLUDED.corrected_by,
                     corrected_at = now(), correction_reason = EXCLUDED.correction_reason, judge_value = EXCLUDED.judge_value`,
            params: [sheet.id, `${a}:${b}`, to, accountId, reason, judgeValue],
          }
        : {
            text: `INSERT INTO member_score (sheet_id, student_id, field, value, corrected_by, corrected_at, correction_reason, judge_value) VALUES ($1, $2, $3, $4, $5, now(), $6, $7)
                   ON CONFLICT (sheet_id, student_id, field) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), corrected_by = EXCLUDED.corrected_by,
                     corrected_at = now(), correction_reason = EXCLUDED.correction_reason, judge_value = EXCLUDED.judge_value`,
            params: [sheet.id, a, b, to, accountId, reason, judgeValue],
          };
  await transaction([
    write,
    logStatement(event.id, accountId, 'score.correct', { group: sheet.group_id, half: sheet.half, sheet: sheet.id, judge: sheet.judge_name, key, label, from, to, reason }),
  ]);
  return { ok: true, ...where, label, judge: sheet.judge_name, from, to };
}

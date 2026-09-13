// Loads what the judge profiles need (item 14). The measures themselves are in judge-profiles.ts.
// A judge is one account, kept year after year, so the same person picked for two events builds one record.

import { query } from './db';
import { judgeProfile, type JudgeProfile, type ProfileSheet } from './judge-profiles';
import { eventJudges, getEvent, listGroups, loadEventScores, type EventRow } from './repo';

export async function eventProfileSheets(event: EventRow): Promise<ProfileSheet[]> {
  const [groups, scores] = await Promise.all([listGroups(event.id), loadEventScores(event)]);
  const byId = new Map(groups.map((g) => [g.id, g]));
  return scores.sheets
    .filter((s) => byId.has(s.group_id))
    .map((s) => ({
      judgeId: s.judge_id,
      judgeName: s.judge_name,
      groupId: s.group_id,
      groupCode: byId.get(s.group_id)!.code,
      groupName: byId.get(s.group_id)!.name,
      half: s.half,
      values: scores.sheetValues.get(s.id)!,
    }));
}

/** Every judge of an event (assigned, or with scores), with their profile. */
export async function eventProfiles(event: EventRow): Promise<JudgeProfile[]> {
  const [sheets, judges] = await Promise.all([eventProfileSheets(event), eventJudges(event.id)]);
  const names = new Map<string, string>(judges.map((j) => [j.id, j.display_name]));
  for (const s of sheets) names.set(s.judgeId, s.judgeName);
  return [...names.entries()].map(([id, name]) => judgeProfile(id, name, sheets, event.rubric)).sort((a, b) => a.judgeName.localeCompare(b.judgeName));
}

/** One line per event this judge scored in, oldest first. */
export async function judgeHistory(judgeId: string): Promise<{ event: EventRow; profile: JudgeProfile }[]> {
  const ids = await query<{ event_id: string }>('SELECT DISTINCT event_id FROM score_sheet WHERE judge_id = $1', [judgeId]);
  const out: { event: EventRow; profile: JudgeProfile }[] = [];
  for (const { event_id } of ids) {
    const event = await getEvent(event_id);
    if (!event) continue;
    const sheets = await eventProfileSheets(event);
    const name = sheets.find((s) => s.judgeId === judgeId)?.judgeName ?? '';
    out.push({ event, profile: judgeProfile(judgeId, name, sheets, event.rubric) });
  }
  return out.sort((a, b) => a.event.year - b.event.year || new Date(a.event.created_at).getTime() - new Date(b.event.created_at).getTime());
}

/** "+1.10 pts", "−4.20 pts", "0.00 pts". */
export function signedPoints(n: number | null): string {
  if (n === null) return '—';
  const r = Math.round(Math.abs(n) * 100) / 100;
  return `${r === 0 ? '' : n > 0 ? '+' : '−'}${r.toFixed(2)} pts`;
}

export const capital = (s: string | null | undefined) => (s ? s[0].toUpperCase() + s.slice(1) : '—');

'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { logStatement } from '@/lib/change-log';
import { newId, one, query, transaction } from '@/lib/db';
import { uploadWorkbookFile, type UploadResult } from '@/lib/data-upload';
import { itemsNeedYou } from '@/lib/finalise';
import { LOCKED_SENT } from '@/lib/locks';
import { eventFinaliseChecks, eventReport, getEvent, listEvents } from '@/lib/repo';
import { HALVES, rubricForNewEvent, withCriterionWording } from '@/lib/rubric';
import { isSeedEvent, replaceSampleEvent } from '@/lib/seed';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

function back(path: string, msg: { ok?: string; error?: string }): never {
  const u = new URLSearchParams();
  if (msg.ok) u.set('ok', msg.ok);
  if (msg.error) u.set('error', msg.error);
  redirect(`${path}${path.includes('?') ? '&' : '?'}${u.toString()}`);
}

async function log(eventId: string | null, accountId: string, action: string, detail: object) {
  const { text, params } = logStatement(eventId, accountId, action, detail);
  await query(text, params);
}

async function eventOr404(eventId: string) {
  const e = await getEvent(eventId);
  if (!e) redirect('/admin');
  return e;
}

// ── events ────────────────────────────────────────────────────

export async function createEvent(fd: FormData) {
  const acc = await requireAdmin();
  const year = parseInt(s(fd, 'year'), 10);
  const title = s(fd, 'title') || `Tambiz ${year}`;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) back('/admin', { error: 'Type the year as four digits, for example 2027.' });
  // Start from the newest event's scoring sheet, copied so editing it can never change an old event,
  // with known misspellings corrected for the new event only ("Informercial" → "Infomercial", decision 12).
  const latest = (await listEvents())[0];
  const id = newId();
  await query(`INSERT INTO event (id, year, title, rubric) VALUES ($1, $2, $3, $4::jsonb)`, [id, year, title, JSON.stringify(rubricForNewEvent(latest?.rubric))]);
  await log(id, acc.id, 'event.create', { year, title });
  back(`/admin/events/${id}/students`, { ok: `Created ${title}. Upload its workbook to begin.` });
}

/** Replaces an event made from the sample data (such as an older version's sample event) with a fresh practice event. */
export async function replaceSampleData(fd: FormData) {
  const acc = await requireAdmin();
  const eventId = s(fd, 'eventId');
  if (!isSeedEvent(eventId)) back('/admin', { error: 'Only an event made from the sample data can be replaced. Events you created are never replaced.' });
  if (s(fd, 'confirm') !== 'yes') back('/admin', { error: 'Tick the box to confirm before replacing the sample data.' });
  const done = await replaceSampleEvent({ query, transaction }, eventId, acc.id);
  if (!done.ok) back('/admin', { error: done.message });
  back('/admin', { ok: `Replaced the sample data with ${done.title}.` });
}

// ── closing the event ─────────────────────────────────────────
// Closing locks judging. It can be undone, with a warning, until the email file has been downloaded; after that
// nothing about the event can change.

export async function closeEvent(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = `/admin/events/${event.id}/close`;
  if (event.status === 'finalised') back(path, { ok: 'The event is already closed.' });
  if (s(fd, 'confirm') !== 'yes') back(path, { error: 'Tick the box to confirm before closing the event.' });
  // Decisions 5 and 6: every group fully judged or accepted with a reason, every member scored or absent.
  const { blockers } = eventFinaliseChecks(await eventReport(event));
  if (blockers.length) back(path, { error: `The event cannot close yet: ${itemsNeedYou(blockers.length)} you first. They are listed below.` });
  await query(`UPDATE event SET status = 'finalised', finalised_at = now() WHERE id = $1 AND released_at IS NULL`, [event.id]);
  await log(event.id, acc.id, 'event.close', { from: event.status });
  back(path, { ok: 'The event is closed. Judges can no longer change scores. Download the two files below.' });
}

export async function undoClose(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = `/admin/events/${event.id}/close`;
  if (event.released_at) back(path, { error: `${LOCKED_SENT} Closing cannot be undone.` });
  if (s(fd, 'confirm') !== 'yes') back(path, { error: 'Tick the box to confirm before undoing the close.' });
  // The email file is checked again in the same statement, so a download at the same moment wins.
  const undone = await one<{ id: string }>(`UPDATE event SET status = 'judging', finalised_at = NULL WHERE id = $1 AND released_at IS NULL RETURNING id`, [event.id]);
  if (!undone) back(path, { error: `${LOCKED_SENT} Closing cannot be undone.` });
  await log(event.id, acc.id, 'event.reopen', {});
  back(path, { ok: 'Closing is undone. Judges can change scores again, and the workbook you downloaded may no longer match.' });
}

// ── closing: accepted groups and absences (decisions 5 and 6) ──

const REASON_MAX = 200;
const reasonOf = (fd: FormData) => s(fd, 'reason').replace(/\s+/g, ' ').slice(0, REASON_MAX);
/** Where to return to: only paths inside this event are accepted. */
const returnTo = (fd: FormData, eventId: string, fallback: string) => {
  const r = s(fd, 'return');
  return r.startsWith(`/admin/events/${eventId}/`) && !r.includes('//') ? r : fallback;
};

export async function acceptGroup(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = returnTo(fd, event.id, `/admin/events/${event.id}/close`);
  if (event.released_at) back(path, { error: LOCKED_SENT });
  const reason = reasonOf(fd);
  if (reason.length < 3) back(path, { error: 'Type a short reason, for example “Did not run a booth”.' });
  const g = await one<{ name: string }>('UPDATE tgroup SET accept_reason = $3, accepted_at = now() WHERE id = $1 AND event_id = $2 RETURNING name', [s(fd, 'groupId'), event.id, reason]);
  if (!g) back(path, { error: 'Group not found.' });
  await log(event.id, acc.id, 'group.accept', { groupId: s(fd, 'groupId'), reason });
  back(path, { ok: `${g.name} will be finalised with the scores it has. Reason recorded.` });
}

export async function clearAcceptance(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const path = returnTo(fd, event.id, `/admin/events/${event.id}/close`);
  if (event.released_at) back(path, { error: LOCKED_SENT });
  await query('UPDATE tgroup SET accept_reason = NULL, accepted_at = NULL WHERE id = $1 AND event_id = $2', [s(fd, 'groupId'), event.id]);
  await log(event.id, acc.id, 'group.accept.clear', { groupId: s(fd, 'groupId') });
  back(path, { ok: 'Removed. That group again needs every score before the event can close.' });
}

export async function setMemberAbsent(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const groupId = s(fd, 'groupId');
  const path = returnTo(fd, event.id, `/admin/events/${event.id}/close`);
  if (event.released_at) back(path, { error: LOCKED_SENT });
  const absent = s(fd, 'absent') === 'yes';
  const row = await one<{ student_id: string }>(
    `UPDATE group_member SET absent_at = CASE WHEN $4::boolean THEN coalesce(absent_at, now()) ELSE NULL END, absent_by = CASE WHEN $4::boolean THEN $5 ELSE NULL END
     WHERE event_id = $1 AND group_id = $2 AND student_id = $3 RETURNING student_id`,
    [event.id, groupId, s(fd, 'studentId'), absent, acc.id],
  );
  if (!row) back(path, { error: 'That student is not in this group.' });
  await log(event.id, acc.id, absent ? 'member.absent' : 'member.present', { groupId, studentId: row.student_id });
  back(path, { ok: absent ? 'Marked absent from the defense. Individual scores nobody gave now count as zero.' : 'Marked present. They need individual scores from the defense judges.' });
}

// ── scoring sheet wording ─────────────────────────────────────

export async function saveCriteria(fd: FormData) {
  const acc = await requireAdmin();
  const event = await eventOr404(s(fd, 'eventId'));
  const { rubric, worded } = withCriterionWording(event.rubric, (field) => (fd.has(field) ? String(fd.get(field)) : null));
  await query('UPDATE event SET rubric = $2::jsonb WHERE id = $1', [event.id, JSON.stringify(rubric)]);
  await log(event.id, acc.id, 'rubric.wording', { worded });
  const total = HALVES.reduce((n, h) => n + rubric.halves[h].categories.reduce((m, c) => m + c.maxes.length, 0), 0);
  back(`/admin/events/${event.id}/sheet`, { ok: `Wording saved: ${worded} of ${total} criteria have wording. Judges see it the next time they open a group.` });
}

// ── the workbook upload ───────────────────────────────────────

/** Reads an uploaded workbook and applies it. Returns what happened, and each judge's password to print, shown once. */
export async function uploadWorkbook(eventId: string, _previous: UploadResult | null, fd: FormData): Promise<UploadResult> {
  const acc = await requireAdmin();
  const result = await uploadWorkbookFile(eventId, acc.id, fd.get('file'));
  // The Data table below the form shows the students as they are now.
  if (result.ok) refresh();
  return result;
}

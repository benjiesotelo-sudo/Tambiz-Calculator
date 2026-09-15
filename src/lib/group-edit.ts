// Creating, correcting and deleting a group, with every rule in one place: the Groups table and the older forms both
// call these. A group is known by its name alone, so no two groups in an event may share one. After release a group's
// name and adviser can still be corrected, each change recorded with who and when and its consequence said at once;
// its section cannot change, no group can be added, and none can be deleted.

import { logStatement } from './change-log';
import { newId, one, transaction, type Statement } from './db';
import { getGroup, type EventRow, type GroupRow } from './repo';
import { nameKey } from './seed';

export interface GroupFields {
  name: string;
  section: string;
  /** An adviser's id, a new adviser's name, or empty for no adviser. */
  adviser: string;
}

export type GroupEdit =
  | { ok: true; group: GroupRow; created: boolean; changes: string[]; message: string }
  | { ok: false; error: string; field?: keyof GroupFields };

const isUnique = (e: unknown) => (e as { code?: string })?.code === '23505';

export const adviserWord = (name: string | null | undefined) => name || 'no adviser';

/** The consequence of a released group's adviser changing, said at the moment it happens. */
export const adviserChangeWarning = (who: string) =>
  `Results were already released, so ${who} result pages and the adviser ranking change, and the mailing sheet already sent no longer matches. An adviser who had no link yet can be given one on the Release tab with “Download links for the people with none yet”.`;

/** Why a name is refused because another group of the event already has it, naming that group. */
export const sameNameError = (typed: string, other: string) =>
  typed === other
    ? `There is already a group called ${other}. Two groups cannot share a name.`
    : `“${typed}” counts as the same name as the group ${other}: spacing, punctuation and capitals are ignored. Two groups cannot share a name.`;

/** The group of this event whose name counts as the same as `key`, other than the one being edited. */
const sameName = (eventId: string, key: string, exceptId: string) =>
  one<{ name: string }>('SELECT name FROM tgroup WHERE event_id = $1 AND name_key = $2 AND id <> $3', [eventId, key, exceptId]);

/** An adviser typed or picked for a group: an existing adviser by id or by name, or a new one to add with the group. */
async function adviserFor(eventId: string, text: string): Promise<{ id: string | null; name: string | null; add: Statement[] }> {
  const t = text.trim();
  if (!t) return { id: null, name: null, add: [] };
  const byId = await one<{ id: string; name: string }>('SELECT id, name FROM adviser WHERE event_id = $1 AND id = $2', [eventId, t]);
  if (byId) return { ...byId, add: [] };
  const key = nameKey(t);
  const byName = await one<{ id: string; name: string }>('SELECT id, name FROM adviser WHERE event_id = $1 AND name_key = $2', [eventId, key]);
  if (byName) return { ...byName, add: [] };
  const id = newId();
  return { id, name: t, add: [{ text: 'INSERT INTO adviser (id, event_id, name, name_key) VALUES ($1, $2, $3, $4)', params: [id, eventId, t, key] }] };
}

/** Saves a new group (before = null) or a change to one. */
export async function editGroup(event: EventRow, accountId: string, before: GroupRow | null, fields: GroupFields): Promise<GroupEdit> {
  const name = fields.name.trim();
  const section = fields.section.trim().toUpperCase();
  const released = !!event.released_at;
  if (released && !before) return { ok: false, error: 'Results have been released, so no new group can be added.' };
  if (released && before && before.section !== section) {
    return { ok: false, field: 'section', error: 'Results have been released, so the section cannot change now. The name and adviser can still be corrected.' };
  }
  if (!name) return { ok: false, field: 'name', error: 'A group needs a name.' };
  const key = nameKey(name);
  if (!key) return { ok: false, field: 'name', error: 'The group name needs at least one letter or number.' };
  const clash = await sameName(event.id, key, before?.id ?? '');
  if (clash) return { ok: false, field: 'name', error: sameNameError(name, clash.name) };
  const adviser = await adviserFor(event.id, fields.adviser);
  try {
    if (before) {
      const changes = [
        before.name !== name ? `Name ${before.name} → ${name}` : '',
        before.section !== section ? `Section ${before.section || 'none'} → ${section || 'none'}` : '',
        (before.adviser_id ?? null) !== adviser.id ? `Adviser ${adviserWord(before.adviser_name)} → ${adviserWord(adviser.name)}` : '',
      ].filter(Boolean);
      await transaction([
        ...adviser.add,
        { text: 'UPDATE tgroup SET name = $3, name_key = $4, section = $5, adviser_id = $6 WHERE id = $1 AND event_id = $2', params: [before.id, event.id, name, key, section, adviser.id] },
        logStatement(event.id, accountId, 'group.update', {
          groupId: before.id,
          name,
          section,
          adviserId: adviser.id,
          from: { name: before.name, section: before.section, adviserId: before.adviser_id },
          changes,
          released,
        }),
      ]);
      const group = (await getGroup(event.id, before.id))!;
      if (!released || !changes.length) return { ok: true, group, created: false, changes, message: 'Group saved.' };
      const warnings = [
        before.name !== name ? 'Results were already released, so the members’ and adviser’s result pages now show the new name.' : '',
        (before.adviser_id ?? null) !== adviser.id ? adviserChangeWarning(`${adviserWord(before.adviser_name)}’s and ${adviserWord(adviser.name)}’s`) : '',
      ].filter(Boolean);
      return { ok: true, group, created: false, changes, message: `Group saved: ${changes.join('; ')}. ${warnings.join(' ')} The change is recorded with your name and the time.` };
    }
    const id = newId();
    await transaction([
      ...adviser.add,
      { text: 'INSERT INTO tgroup (id, event_id, name, name_key, section, adviser_id) VALUES ($1, $2, $3, $4, $5, $6)', params: [id, event.id, name, key, section, adviser.id] },
      logStatement(event.id, accountId, 'group.create', { id, name, section }),
    ]);
    return { ok: true, group: (await getGroup(event.id, id))!, created: true, changes: [], message: `Created ${name}. Now add its members.` };
  } catch (e) {
    if (!isUnique(e)) throw e;
    // Someone saved the same name at the same moment.
    const other = await sameName(event.id, key, before?.id ?? '');
    return { ok: false, field: 'name', error: other ? sameNameError(name, other.name) : 'Another group was saved with that name at the same moment. Reload the page.' };
  }
}

/** Deletes a group, or says why it cannot be deleted. */
export async function removeGroup(event: EventRow, accountId: string, groupId: string): Promise<string | null> {
  if (event.released_at) return 'Results have been released, so a group cannot be deleted. Its name and adviser can still be corrected.';
  const sheets = await one<{ n: number }>('SELECT count(*)::int AS n FROM score_sheet WHERE group_id = $1', [groupId]);
  if (sheets && sheets.n > 0) return 'This group already has scores, so it cannot be deleted.';
  await transaction([{ text: 'DELETE FROM tgroup WHERE id = $1 AND event_id = $2', params: [groupId, event.id] }, logStatement(event.id, accountId, 'group.delete', { groupId })]);
  return null;
}

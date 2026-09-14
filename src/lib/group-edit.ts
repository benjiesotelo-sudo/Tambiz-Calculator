// Creating, correcting and deleting a group, with every rule in one place: the Groups table and the older forms both
// call these. After release a group's code, name and adviser can still be corrected, each change recorded with who and
// when and its consequence said at once; its section cannot change, no group can be added, and none can be deleted.

import { logStatement } from './change-log';
import { newId, one, query, transaction, type Statement } from './db';
import { getGroup, type EventRow, type GroupRow } from './repo';
import { nameKey } from './seed';

export interface GroupFields {
  code: string;
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

/** The next unused code of the form G01, G02… */
export async function nextGroupCode(eventId: string): Promise<string> {
  const rows = await query<{ code: string }>('SELECT code FROM tgroup WHERE event_id = $1', [eventId]);
  const n = Math.max(0, ...rows.map((r) => Number(/^G(\d+)$/i.exec(r.code)?.[1] ?? 0)));
  return `G${String(n + 1).padStart(2, '0')}`;
}

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
  const code = fields.code.trim().toUpperCase();
  const name = fields.name.trim();
  const section = fields.section.trim().toUpperCase();
  const released = !!event.released_at;
  if (released && !before) return { ok: false, error: 'Results have been released, so no new group can be added.' };
  if (released && before && before.section !== section) {
    return { ok: false, field: 'section', error: 'Results have been released, so the section cannot change now. The code, name and adviser can still be corrected.' };
  }
  if (!code || !name) return { ok: false, field: code ? 'name' : 'code', error: 'A group needs a code and a name.' };
  const key = nameKey(name);
  if (!key) return { ok: false, field: 'name', error: 'The group name needs at least one letter or number.' };
  const clash = await one<{ code: string; name: string }>('SELECT code, name FROM tgroup WHERE event_id = $1 AND (code = $2 OR name_key = $3) AND id <> $4', [
    event.id,
    code,
    key,
    before?.id ?? '',
  ]);
  if (clash) {
    return clash.code === code
      ? { ok: false, field: 'code', error: `Code ${code} is already used by ${clash.name}.` }
      : { ok: false, field: 'name', error: `“${name}” is the same name as ${clash.code} ${clash.name} (spacing and punctuation are ignored).` };
  }
  const adviser = await adviserFor(event.id, fields.adviser);
  try {
    if (before) {
      const changes = [
        before.code !== code ? `Code ${before.code} → ${code}` : '',
        before.name !== name ? `Name ${before.name} → ${name}` : '',
        before.section !== section ? `Section ${before.section || 'none'} → ${section || 'none'}` : '',
        (before.adviser_id ?? null) !== adviser.id ? `Adviser ${adviserWord(before.adviser_name)} → ${adviserWord(adviser.name)}` : '',
      ].filter(Boolean);
      await transaction([
        ...adviser.add,
        { text: 'UPDATE tgroup SET code = $3, name = $4, name_key = $5, section = $6, adviser_id = $7 WHERE id = $1 AND event_id = $2', params: [before.id, event.id, code, name, key, section, adviser.id] },
        logStatement(event.id, accountId, 'group.update', {
          groupId: before.id,
          code,
          name,
          section,
          adviserId: adviser.id,
          from: { code: before.code, name: before.name, section: before.section, adviserId: before.adviser_id },
          changes,
          released,
        }),
      ]);
      const group = (await getGroup(event.id, before.id))!;
      if (!released || !changes.length) return { ok: true, group, created: false, changes, message: 'Group saved.' };
      const warnings = [
        before.code !== code || before.name !== name ? 'Results were already released, so the members’ and adviser’s result pages now show the new code and name.' : '',
        (before.adviser_id ?? null) !== adviser.id ? adviserChangeWarning(`${adviserWord(before.adviser_name)}’s and ${adviserWord(adviser.name)}’s`) : '',
      ].filter(Boolean);
      return { ok: true, group, created: false, changes, message: `Group saved: ${changes.join('; ')}. ${warnings.join(' ')} The change is recorded with your name and the time.` };
    }
    const id = newId();
    await transaction([
      ...adviser.add,
      { text: 'INSERT INTO tgroup (id, event_id, code, name, name_key, section, adviser_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', params: [id, event.id, code, name, key, section, adviser.id] },
      logStatement(event.id, accountId, 'group.create', { id, code, name, section }),
    ]);
    return { ok: true, group: (await getGroup(event.id, id))!, created: true, changes: [], message: `Created ${code} ${name}. Now add its members.` };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: 'Another group already has that code or name.' };
    throw e;
  }
}

/** Deletes a group, or says why it cannot be deleted. */
export async function removeGroup(event: EventRow, accountId: string, groupId: string): Promise<string | null> {
  if (event.released_at) return 'Results have been released, so a group cannot be deleted. Its code, name and adviser can still be corrected.';
  const sheets = await one<{ n: number }>('SELECT count(*)::int AS n FROM score_sheet WHERE group_id = $1', [groupId]);
  if (sheets && sheets.n > 0) return 'This group already has scores, so it cannot be deleted.';
  await transaction([{ text: 'DELETE FROM tgroup WHERE id = $1 AND event_id = $2', params: [groupId, event.id] }, logStatement(event.id, accountId, 'group.delete', { groupId })]);
  return null;
}

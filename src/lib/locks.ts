// What stops a change once the event is closed, or once its email file has gone out. One wording everywhere.

import type { EventRow } from './repo';

export const LOCKED_SENT = 'The email file has been downloaded, so nothing can change now.';
export const LOCKED_CLOSED = 'The event is closed. Undo closing on the Close tab first.';

/** Why nothing about this event can change, or null. */
export const sentLock = (event: Pick<EventRow, 'released_at'>) => (event.released_at ? LOCKED_SENT : null);

/** Why who is in the event, and in which group, cannot change: closed or sent. Null while the event is open. */
export const rosterLock = (event: Pick<EventRow, 'released_at' | 'status'>) => sentLock(event) ?? (event.status === 'finalised' ? LOCKED_CLOSED : null);

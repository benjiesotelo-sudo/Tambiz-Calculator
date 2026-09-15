// The app's own change history (report section 5.3): every change to rosters, scores and event status, with who and when.

import { newId, type Statement } from './db';

/** One history entry, as a statement to run inside the same transaction as the change it records. */
export const logStatement = (eventId: string | null, accountId: string, action: string, detail: object): Statement => ({
  text: 'INSERT INTO change_log (id, event_id, account_id, action, detail) VALUES ($1, $2, $3, $4, $5::jsonb)',
  params: [newId(), eventId, accountId, action, JSON.stringify(detail)],
});

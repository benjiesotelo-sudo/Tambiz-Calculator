import Link from 'next/link';
import type { EventRow } from '@/lib/repo';

// The coordinator's screens for one event, in the order an event is run.
const TABS = [
  ['students', 'Data'],
  ['judges', 'Judges'],
  ['sheet', 'Scoring sheet'],
  ['progress', 'Progress'],
  ['results', 'Results'],
  ['profiles', 'Judge profiles'],
  ['close', 'Close the event'],
] as const;

export type EventTab = (typeof TABS)[number][0];

export const statusLabel = (event: Pick<EventRow, 'status' | 'released_at'>) =>
  event.released_at ? 'Closed, email file downloaded' : event.status === 'finalised' ? 'Closed' : 'Open for judging';

export function PracticeBanner({ event }: { event: Pick<EventRow, 'practice'> }) {
  return event.practice ? (
    <div className="notice warn practice-banner" role="note">
      <b>Practice event.</b> Everything here is invented, for trying the app out. Scores given here count for nobody.
    </div>
  ) : null;
}

export function EventHeader({ event, tab, title }: { event: EventRow; tab: EventTab; title?: string }) {
  return (
    <>
      <div className="crumbs">
        <Link href="/admin">‹ All events</Link>
      </div>
      <div className="eyebrow">
        {event.title} · {statusLabel(event)}
      </div>
      <h1 className="page-title">{title ?? event.title}</h1>
      <PracticeBanner event={event} />
      <nav className="tabs" aria-label="Event sections">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/events/${event.id}/${k}`} className={k === tab ? 'on' : ''}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

/** Results has two views: the groups, and each student's grade. */
export function ResultsViews({ eventId, view }: { eventId: string; view: 'groups' | 'grades' }) {
  return (
    <nav className="tabs subtabs" aria-label="Results views">
      <Link href={`/admin/events/${eventId}/results`} className={view === 'groups' ? 'on' : ''}>
        Groups
      </Link>
      <Link href={`/admin/events/${eventId}/results/grades`} className={view === 'grades' ? 'on' : ''}>
        Individual grades
      </Link>
    </nav>
  );
}

import Link from 'next/link';
import type { EventRow } from '@/lib/repo';

const TABS = [
  ['', 'Home'],
  ['sheet', 'Scoring sheet'],
  ['groups', 'Groups'],
  ['roll', 'Class roll'],
  ['advisers', 'Advisers'],
  ['judges', 'Judges'],
  ['progress', 'Progress'],
  ['results', 'Results'],
  ['grades', 'Grades'],
  ['release', 'Release'],
] as const;

export const STATUS_LABEL = { setup: 'Set-up', judging: 'Judging open', finalised: 'Judging closed' } as const;

export const statusLabel = (event: Pick<EventRow, 'status' | 'released_at'>) => (event.released_at ? 'Results released' : STATUS_LABEL[event.status]);

export function EventHeader({ event, tab, title }: { event: EventRow; tab: (typeof TABS)[number][0]; title?: string }) {
  return (
    <>
      <div className="crumbs">
        <Link href="/admin">‹ All events</Link>
      </div>
      <div className="eyebrow">
        {event.title} · {statusLabel(event)}
      </div>
      <h1 className="page-title">{title ?? event.title}</h1>
      <nav className="tabs" aria-label="Event sections">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/events/${event.id}${k ? '/' + k : ''}`} className={k === tab ? 'on' : ''}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

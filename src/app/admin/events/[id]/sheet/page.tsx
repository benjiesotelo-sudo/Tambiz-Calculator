import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { CriteriaForm } from '@/components/CriteriaForm';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { getEvent } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default async function ScoringSheetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const { rubric } = event;

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="sheet" title="Scoring sheet" />
        <Notice ok={sp.ok} error={sp.error} />
        <p className="lead">
          Type what each criterion is. Judges see this wording on their phones in place of “Criterion 1, Criterion 2”. The points beside each box stay as they are, and changing
          the wording never changes a score, so you can do it at any time.
        </p>
        <div className="notice warn">
          <b>To paste a whole list:</b> copy the criteria from Word or Excel, one per line and in order, then paste into the first box. Each line fills the next box, carrying on
          into the next category. Numbers and bullets at the start of a line are removed. Check the boxes, then press <b>Save wording</b>.
        </div>
        <p className="sub">
          Overall = {rubric.halves.defense.label} × {rubric.halves.defense.weight} + {rubric.halves.booth.label} × {rubric.halves.booth.weight}. Members:{' '}
          {rubric.memberFields.map((f) => `${f.name} /${f.max}`).join(', ')}. Points, weights and letter bands cannot be changed on screen.
        </p>
        <CriteriaForm eventId={event.id} rubric={rubric} />
      </main>
    </>
  );
}

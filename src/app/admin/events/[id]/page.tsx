import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// An event opens on its Data tab, where the coordinator starts.
export default async function EventHome({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  redirect(`/admin/events/${id}/students`);
}

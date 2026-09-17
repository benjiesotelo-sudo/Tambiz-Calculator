import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/auth';
import { logStatement } from '@/lib/change-log';
import { one, query } from '@/lib/db';
import { buildEmailFile, emailRecipients } from '@/lib/email-file';
import { itemsNeedYou } from '@/lib/finalise';
import { eventFinaliseChecks, eventReport, getEvent, listAdvisers } from '@/lib/repo';

export const dynamic = 'force-dynamic';

// The email file (Close the event). The first download is final: it records the time, after which closing cannot be
// undone and nothing about the event can change, so the emails already sent always match the app. A POST, so no link
// preview or prefetch can download it by accident.

/** A request from a page on this app, or with no Origin at all. An Origin that is not a URL, such as "null", is refused. */
function fromThisApp(origin: string | null, host: string | null) {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const back = (error: string) => {
    const u = new URL(`/admin/events/${id}/close`, req.url);
    u.searchParams.set('error', error);
    return NextResponse.redirect(u, 303);
  };

  const acc = await currentAccount();
  if (!acc || acc.role !== 'admin') return NextResponse.json({ error: 'Coordinator sign-in required.' }, { status: 401 });
  if (!fromThisApp(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'Refused.' }, { status: 403 });
  let event = await getEvent(id);
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  if (event.status !== 'finalised') return back('Close the event first. The email file is made only from final results.');

  if (!event.released_at) {
    const fd = await req.formData();
    if (fd.get('confirm') !== 'yes') return back('Tick the box to confirm before downloading the email file. After it, closing cannot be undone.');
    const { blockers } = eventFinaliseChecks(await eventReport(event));
    if (blockers.length) return back(`The email file cannot be made yet: ${itemsNeedYou(blockers.length)} you first. They are listed on this page.`);
    // Recorded in one statement that also checks the event is still closed, so an undo at the same moment cannot slip between.
    const claimed = await one<{ id: string }>(`UPDATE event SET released_at = now() WHERE id = $1 AND status = 'finalised' AND released_at IS NULL RETURNING id`, [event.id]);
    if (claimed) {
      const { text, params: values } = logStatement(event.id, acc.id, 'emails.download', { first: true });
      await query(text, values);
    }
    event = (await getEvent(id))!;
    if (event.status !== 'finalised') return back('Closing was undone at the same moment, so no email file was made. Close the event again.');
  }

  const [report, advisers] = await Promise.all([eventReport(event), listAdvisers(event.id)]);
  const buf = await buildEmailFile(emailRecipients(report, advisers), event.title);
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 16).replace(/[-: ]/g, '');
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${event.title.replace(/[^A-Za-z0-9]+/g, '_')}_emails_${stamp}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}

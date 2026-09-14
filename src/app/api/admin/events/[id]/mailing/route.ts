import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/auth';
import { newId, one, query } from '@/lib/db';
import { issueLinks, linkStatus, linkUrl, releaseRecipients, type Recipient } from '@/lib/links';
import { buildMailingSheet } from '@/lib/mailing';
import { getEvent } from '@/lib/repo';

export const dynamic = 'force-dynamic';

// Releasing results and (re)issuing links (decisions 8 and 11). Each request issues fresh links and returns the only
// copy of them, as the mailing sheet. Modes:
//   release  first release: set the event released and issue a link to everyone
//   missing  after release: issue links only to people who have none yet (for example an adviser given a code later)
//   one      after release: reissue one person's link; their old link stops working
//   all      after release: reissue everyone's link; every earlier link stops working

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = `/admin/events/${id}/release`;
  const back = (msg: { ok?: string; error?: string }) => {
    const u = new URL(page, req.url);
    if (msg.ok) u.searchParams.set('ok', msg.ok);
    if (msg.error) u.searchParams.set('error', msg.error);
    return NextResponse.redirect(u, 303);
  };

  const acc = await currentAccount();
  if (!acc || acc.role !== 'admin') return NextResponse.json({ error: 'Coordinator sign-in required.' }, { status: 401 });
  // A form on this app only: refuse a cross-site post.
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return NextResponse.json({ error: 'Refused.' }, { status: 403 });

  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  const fd = await req.formData();
  const mode = String(fd.get('mode') ?? '');

  if (event.status !== 'finalised') return back({ error: 'Close judging on the Progress tab before releasing results.' });
  const { recipients } = await releaseRecipients(event.id);
  let chosen: Recipient[] = [];

  if (mode === 'release') {
    if (event.released_at) return back({ error: 'Results are already released. Use the reissue buttons below.' });
    if (fd.get('confirm') !== 'yes') return back({ error: 'Tick the box to confirm before releasing results.' });
    const claimed = await one<{ id: string }>(`UPDATE event SET released_at = now() WHERE id = $1 AND released_at IS NULL AND status = 'finalised' RETURNING id`, [event.id]);
    if (!claimed) {
      return back({
        error: 'Results were already released a moment ago, perhaps by pressing the button twice, so no second set of links was made. Use the mailing sheet from that release. If it did not download, use “Reissue every link” below.',
      });
    }
    chosen = recipients;
  } else {
    if (!event.released_at) return back({ error: 'Release results first.' });
    if (mode === 'missing') {
      const live = new Set((await linkStatus(event.id)).map((l) => `${l.recipient_type}:${l.recipient_id}`));
      chosen = recipients.filter((r) => !live.has(`${r.type}:${r.id}`));
      if (!chosen.length) return back({ ok: 'Everyone who can have a link already has one.' });
    } else if (mode === 'one') {
      const who = String(fd.get('recipient') ?? '');
      chosen = recipients.filter((r) => `${r.type}:${r.id}` === who);
      if (!chosen.length) return back({ error: 'That person cannot have a link: check their email, and for an adviser their code.' });
    } else if (mode === 'all') {
      if (fd.get('confirm') !== 'yes') return back({ error: 'Tick the box to confirm. Every link already sent will stop working.' });
      chosen = recipients;
    } else {
      return back({ error: 'Unknown request.' });
    }
  }

  const issued = await issueLinks(event.id, chosen);
  await query('INSERT INTO change_log (id, event_id, account_id, action, detail) VALUES ($1, $2, $3, $4, $5::jsonb)', [
    newId(),
    event.id,
    acc.id,
    `links.${mode}`,
    JSON.stringify({ students: chosen.filter((r) => r.type === 'student').length, advisers: chosen.filter((r) => r.type === 'adviser').length }),
  ]);
  const buf = await buildMailingSheet(
    issued.map(({ recipient, code }) => ({ name: recipient.name, email: recipient.email, link: linkUrl(code), role: recipient.type === 'student' ? 'Student' : 'Adviser' })),
    event.title,
  );
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 16).replace(/[-: ]/g, '');
  const label = { release: 'mailing', missing: 'mailing_new', one: 'mailing_reissued', all: 'mailing_all_reissued' }[mode as 'release'];
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${event.title.replace(/[^A-Za-z0-9]+/g, '_')}_${label}_${stamp}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}

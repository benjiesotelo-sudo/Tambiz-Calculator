import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/auth';
import { buildWorkbook } from '@/lib/excel-export';
import { eventReport, getEvent } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acc = await currentAccount();
  if (!acc || acc.role !== 'admin') return NextResponse.json({ error: 'Coordinator sign-in required.' }, { status: 401 });
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  const buf = await buildWorkbook(await eventReport(event));
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 16).replace(/[-: ]/g, '');
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${event.title.replace(/[^A-Za-z0-9]+/g, '_')}_${stamp}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}

import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/auth';
import { buildDataWorkbook } from '@/lib/data-workbook';
import { dataRows, eventJudges, getEvent } from '@/lib/repo';

export const dynamic = 'force-dynamic';

// Everything currently in the event, as the same workbook the Data tab uploads, to change in Excel and upload back.
// Passwords are never included: the app does not keep them, and an empty Password leaves each judge's as it is.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acc = await currentAccount();
  if (!acc || acc.role !== 'admin') return NextResponse.json({ error: 'Coordinator sign-in required.' }, { status: 401 });
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  const [students, judges] = await Promise.all([dataRows(id), eventJudges(id)]);
  const buf = await buildDataWorkbook({
    students: students.map((s) => ({
      student_number: s.student_number,
      surname: s.surname,
      first_name: s.first_name,
      middle_name: s.middle_name,
      section: s.section,
      email: s.email,
      group: s.group_name ?? '',
      adviser: s.adviser_name ?? '',
      adviser_email: s.adviser_email ?? '',
    })),
    judges: judges.map((j) => ({ name: j.display_name, email: j.email, password: '' })),
  });
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 16).replace(/[-: ]/g, '');
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${event.title.replace(/[^A-Za-z0-9]+/g, '_')}_data_${stamp}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}

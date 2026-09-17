import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/auth';
import { buildDataWorkbook } from '@/lib/data-workbook';

export const dynamic = 'force-dynamic';

// The empty workbook to fill in, built from the importer's own column list, with one example row per sheet.
export async function GET() {
  const acc = await currentAccount();
  if (!acc || acc.role !== 'admin') return NextResponse.json({ error: 'Coordinator sign-in required.' }, { status: 401 });
  return new NextResponse(new Uint8Array(await buildDataWorkbook()), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="Tambiz workbook template.xlsx"',
      'cache-control': 'no-store',
    },
  });
}

import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/auth';
import { buildTemplate, TEMPLATES } from '@/lib/excel-import';

export const dynamic = 'force-dynamic';

// A blank class roll or adviser list to fill in, built from the importer's own columns.
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const acc = await currentAccount();
  if (!acc || acc.role !== 'admin') return NextResponse.json({ error: 'Coordinator sign-in required.' }, { status: 401 });
  const { kind } = await params;
  const template = kind === 'roll' || kind === 'advisers' ? TEMPLATES[kind] : null;
  if (!template) return NextResponse.json({ error: 'Unknown template.' }, { status: 404 });
  return new NextResponse(new Uint8Array(await buildTemplate(template)), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${template.file}"`,
      'cache-control': 'no-store',
    },
  });
}

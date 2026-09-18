import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/auth';
import { fromThisApp } from '@/lib/same-origin';
import { uploadWorkbookFile, type UploadLine } from '@/lib/data-upload';

export const dynamic = 'force-dynamic';

// The Data tab's workbook upload, run exactly as the uploadWorkbook server action runs it, but answering as it goes:
// one line of JSON for each step of progress, out of the rows in the file, then one line with the result. The page
// shows the progress and refreshes its table when the result says the upload worked.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acc = await currentAccount();
  if (!acc || acc.role !== 'admin') return NextResponse.json({ error: 'Coordinator sign-in required.' }, { status: 401 });
  if (!fromThisApp(req.headers.get('origin'), req.headers.get('host'))) return NextResponse.json({ error: 'Refused.' }, { status: 403 });
  const file = (await req.formData()).get('file');

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: UploadLine) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      let last = '';
      try {
        const result = await uploadWorkbookFile(id, acc.id, file, (progress) => {
          // Each row as it is reached, and every change of step.
          const at = `${progress.stage}:${progress.done}`;
          if (at === last) return;
          last = at;
          send({ progress });
        });
        send({ result });
      } catch (e) {
        console.error(e);
        send({ result: { ok: false, message: 'The upload could not be finished. Nothing was changed. Try again.', problems: [], signIns: [] } });
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}

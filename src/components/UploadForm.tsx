'use client';

// The workbook upload on the Data tab. While it runs it shows how far it has got, out of the rows in the file (from
// the upload route, which runs exactly what the uploadWorkbook action runs). Then it shows what the upload did,
// anything it could not take, and, once, the sign-in details of every judge whose password it set, laid out to print.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { UploadLine, UploadProgress, UploadResult } from '@/lib/data-upload';
import { SignInSlips } from './SignInSlips';

const FAILED: UploadResult = { ok: false, message: 'The upload could not reach the app. Check the connection and try again.', problems: [], signIns: [] };

function stepText(p: UploadProgress | null) {
  if (!p) return 'Sending the workbook';
  if (p.stage === 'students') return `Checking ${p.students} student${p.students === 1 ? '' : 's'}`;
  if (p.stage === 'judges') return `Setting up ${p.judges} judge${p.judges === 1 ? '' : 's'}`;
  return `Saving all ${p.of} row${p.of === 1 ? '' : 's'} together`;
}

export function UploadForm({ eventId, eventTitle, disabled }: { eventId: string; eventTitle: string; disabled?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const upload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPending(true);
    setProgress(null);
    setResult(null);
    let final: UploadResult = FAILED;
    try {
      const res = await fetch(`/api/admin/events/${eventId}/upload`, { method: 'POST', body: fd });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        final = { ...FAILED, message: data.error ?? FAILED.message };
      } else {
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (value) buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line) as UploadLine;
            if ('progress' in msg) setProgress(msg.progress);
            else final = msg.result;
          }
          if (done) break;
        }
      }
    } catch {
      final = FAILED;
    }
    form.reset();
    setResult(final);
    setPending(false);
    // The Data table below the form shows the students as they are now.
    if (final.ok) router.refresh();
  };

  const pct = progress && progress.of ? Math.round((progress.done / progress.of) * 100) : 0;
  return (
    <>
      <form onSubmit={upload} className="form" style={{ marginTop: 8 }}>
        <div className="upload-row">
          <input className="input" type="file" name="file" accept=".xlsx" required disabled={!!disabled || pending} aria-label="The workbook to upload" />
          <button className="btn" type="submit" disabled={!!disabled || pending} aria-busy={pending || undefined}>
            {pending ? (
              <span className="swap">
                <span className="spinner" aria-hidden="true" />
                Uploading…
              </span>
            ) : (
              'Upload workbook'
            )}
          </button>
        </div>
        {disabled ? <span className="sub">{disabled}</span> : null}
      </form>
      {pending ? (
        <div className="progress" role="status" aria-live="polite">
          <div className="progress-head">
            <span className="swap" key={progress?.stage ?? 'send'}>
              {!progress || progress.stage === 'saving' || progress.stage === 'done' ? <span className="spinner" aria-hidden="true" /> : null}
              {stepText(progress)}
            </span>
            <span>{progress ? `${progress.done} of ${progress.of} rows` : ''}</span>
          </div>
          <div className="progress-track" role="progressbar" aria-label="Rows checked" aria-valuemin={0} aria-valuemax={progress?.of ?? 0} aria-valuenow={progress?.done ?? 0}>
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}
      {result ? (
        <div aria-live="polite">
          <div className={`notice ${result.ok ? 'ok' : 'err'}`} role={result.ok ? 'status' : 'alert'}>
            {result.message}
          </div>
          {result.problems.length ? (
            <div className="notice warn">
              <b>
                {result.problems.length} thing{result.problems.length === 1 ? '' : 's'} to check in the file:
              </b>
              <ul style={{ margin: '8px 0 0', paddingLeft: 24 }}>
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <SignInSlips slips={result.signIns} eventTitle={eventTitle} />
        </div>
      ) : null}
    </>
  );
}

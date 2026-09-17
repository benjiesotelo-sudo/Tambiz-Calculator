'use client';

// The workbook upload on the Data tab. It shows what the upload did, anything it could not take, and, once, the
// sign-in details of every judge whose password it set, laid out to print.

import { useActionState } from 'react';
import type { UploadResult } from '@/lib/data-upload';
import { SignInSlips } from './SignInSlips';

export function UploadForm({ action, eventTitle, disabled }: { action: (previous: UploadResult | null, fd: FormData) => Promise<UploadResult>; eventTitle: string; disabled?: string }) {
  const [result, run, pending] = useActionState(action, null);
  return (
    <>
      <form action={run} className="form" style={{ marginTop: 8 }}>
        <input className="input" type="file" name="file" accept=".xlsx" required disabled={!!disabled || pending} aria-label="The workbook to upload" />
        <button className="btn" type="submit" disabled={!!disabled || pending}>
          {pending ? 'Uploading…' : 'Upload workbook'}
        </button>
        {disabled ? <span className="sub">{disabled}</span> : null}
      </form>
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
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
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

'use client';

// A form's submit button that says so, and spins, while its form is being sent.

import { useFormStatus } from 'react-dom';

export function SubmitButton({ children, busy, className = 'btn', disabled }: { children: React.ReactNode; busy: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={disabled} aria-busy={pending || undefined}>
      {pending ? (
        <span className="swap">
          <span className="spinner" aria-hidden="true" />
          {busy}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

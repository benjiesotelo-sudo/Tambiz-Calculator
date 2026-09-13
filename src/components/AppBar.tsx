import Link from 'next/link';
import type { Account } from '@/lib/auth';

export function AppBar({ title = 'Tambiz', subtitle, account, home = '/' }: { title?: string; subtitle?: string; account?: Account | null; home?: string }) {
  return (
    <header className="appbar">
      <Link href={home} className="brand">
        {title}
        {subtitle ? <small>{subtitle}</small> : null}
      </Link>
      <div className="spacer" />
      {account ? (
        <>
          <span className="who">{account.display_name}</span>
          <Link href="/account" className="barlink">
            Account
          </Link>
        </>
      ) : null}
    </header>
  );
}

export function Notice({ ok, error, warn }: { ok?: string; error?: string; warn?: string }) {
  return (
    <>
      {ok ? <div className="notice ok" role="status">{ok}</div> : null}
      {error ? <div className="notice err" role="alert">{error}</div> : null}
      {warn ? <div className="notice warn">{warn}</div> : null}
    </>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import type { Account } from '@/lib/auth';
import wordmarkWhite from '@/assets/brand/feu-wordmark-white.png';

/** The FEU wordmark, white for the green chrome, beside the name in the serif. */
export function Brand({ title = 'Tambiz', subtitle, href }: { title?: string; subtitle?: string; href: string }) {
  return (
    <Link href={href} className="brand">
      <Image src={wordmarkWhite} alt="Far Eastern University" className="wordmark" height={24} priority />
      <span className="rule" aria-hidden="true" />
      <span className="brand-text">
        <span className="brand-name">{title}</span>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </Link>
  );
}

export function AppBar({ title = 'Tambiz', subtitle, account, home = '/' }: { title?: string; subtitle?: string; account?: Account | null; home?: string }) {
  return (
    <header className="appbar">
      <Brand title={title} subtitle={subtitle} href={home} />
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

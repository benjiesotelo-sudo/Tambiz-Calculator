'use server';

import { redirect } from 'next/navigation';
import { closeLinkSession, CODE_PATTERN, openLink } from '@/lib/links';

const codeOf = (fd: FormData) => {
  const code = String(fd.get('code') ?? '');
  if (!CODE_PATTERN.test(code)) redirect('/login');
  return code;
};

export async function checkLink(fd: FormData) {
  const code = codeOf(fd);
  const r = await openLink(code, String(fd.get('check') ?? ''));
  if (!r.ok && r.state === 'wrong') redirect(`/r/${code}?wrong=${r.triesLeft}`);
  redirect(`/r/${code}`);
}

export async function closeLink(fd: FormData) {
  const code = codeOf(fd);
  await closeLinkSession(code);
  redirect(`/r/${code}?closed=1`);
}

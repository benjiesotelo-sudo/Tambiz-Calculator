import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const acc = await currentAccount();
  if (!acc) redirect('/login');
  redirect(acc.role === 'admin' ? '/admin' : '/judge');
}

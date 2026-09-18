import type { Metadata, Viewport } from 'next';
import { Source_Serif_4 } from 'next/font/google';
import './globals.css';

// Headings only. Served from this app with the page, preloaded, and with a Georgia fallback sized to match it, so a
// heading never jumps when the face arrives. Body text and every number stay in Helvetica/Arial.
const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'Tambiz',
  description: 'Tambiz judging, results and grades for MGT1114 Business Plan 2, FEU Manila',
  icons: { icon: 'data:,' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#004f21',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body>{children}</body>
    </html>
  );
}

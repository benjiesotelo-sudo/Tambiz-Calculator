import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly and ExcelJS is large; both are loaded by Node at runtime instead of bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'exceljs'],
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
  },
  // Private result links: never pass the address on to other sites, never cache, never index.
  async headers() {
    return [
      {
        source: '/r/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;

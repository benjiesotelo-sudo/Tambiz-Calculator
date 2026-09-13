import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly and ExcelJS is large; both are loaded by Node at runtime instead of bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'exceljs'],
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // API routes are in /api directory (Vercel serverless functions)
  // Pages are in /pages directory
  // Output: standalone for better Vercel compatibility
  output: 'standalone',
};

module.exports = nextConfig;

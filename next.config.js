/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // API routes are in /api directory (Vercel serverless functions)
  // Pages are in /pages directory
  // Output: standalone for better Vercel compatibility
  output: 'standalone',
  // Expose Vercel environment variables to client
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '',
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF || '',
  },
};

module.exports = nextConfig;

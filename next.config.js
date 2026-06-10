/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // API routes are in pages/api directory (Next.js API routes)
  // The root /api directory is for Vercel serverless functions (legacy)
  // Output: standalone for better Vercel compatibility
  output: 'standalone',
  // Expose Vercel environment variables to client
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '',
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF || '',
  },
  // Ignore the root /api directory to avoid conflicts with pages/api
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

module.exports = nextConfig;

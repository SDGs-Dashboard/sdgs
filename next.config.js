// Next.js configuration for both local development and GitHub Pages static export.
// GitHub Pages builds run under /sdgs and cannot use Next.js API routes.
const isGitHubPagesBuild = process.env.GITHUB_PAGES === 'true';
const basePath = isGitHubPagesBuild ? '/sdgs' : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['http://127.0.0.1:3000', 'http://localhost:3000'],
  ...(isGitHubPagesBuild
    ? {
        output: 'export',
        trailingSlash: true,
        basePath,
        assetPrefix: `${basePath}/`,
        images: {
          unoptimized: true
        },
        env: {
          NEXT_PUBLIC_STATIC_EXPORT: 'true',
          NEXT_PUBLIC_BASE_PATH: basePath
        }
      }
    : {
        env: {
          NEXT_PUBLIC_STATIC_EXPORT: 'false',
          NEXT_PUBLIC_BASE_PATH: ''
        },
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'X-Frame-Options', value: 'SAMEORIGIN' }
              ]
            }
          ];
        }
      })
};

module.exports = nextConfig;

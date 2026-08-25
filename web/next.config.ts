import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = {
  output: isGitHubPages ? 'export' : undefined,
  basePath: isGitHubPages ? '/AlphabetAndThings' : '',
  assetPrefix: isGitHubPages ? '/AlphabetAndThings/' : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;

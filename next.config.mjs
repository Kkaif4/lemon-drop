/** @type {import('next').NextConfig} */
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';

const nextConfig = {
  output: 'export',
  distDir: 'out',
  // When deploying to https://<user>.github.io/<repo>/, assets need the repository prefix
  basePath: isGithubActions ? '/lemon-drop' : '',
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;


/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1', port: '10000', pathname: '/devstoreaccount1/**' },
      { protocol: 'http', hostname: 'localhost', port: '10000', pathname: '/devstoreaccount1/**' },
      { protocol: 'https', hostname: 'momentia1.blob.core.windows.net', pathname: '/photos/**' }

    ],
  },
};
module.exports = nextConfig;

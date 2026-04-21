/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  webpack: (config, { dev }) => {
    // In dev, filesystem cache can get into a broken state after deleting `.next`,
    // causing noisy ENOENT warnings about `.next/server/app/api/*`. Disable it.
    if (dev) config.cache = false;
    return config;
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
};

export default nextConfig;

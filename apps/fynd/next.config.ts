import type { NextConfig } from "next";

// Every /api/* request is proxied server-side to the central gateway (→ backend/fynd).
// The browser only ever talks to this origin, so auth cookies are first-party and no CORS is needed.
const api = (process.env.FYND_API_URL ?? "http://localhost:4000/fynd").replace(/\/$/, "");

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@nnamaka/fynd-shared"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;

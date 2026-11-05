import type { NextConfig } from "next";

// All /api/* requests are forwarded at runtime by app/api/[...path]/route.ts (reads FYND_API_URL per request).

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
};

export default nextConfig;

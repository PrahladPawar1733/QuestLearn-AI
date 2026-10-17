import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-student (guest cookie, live progress), so we render on
  // request rather than using Cache Components / partial prerendering.
  cacheComponents: false,
  // Self-contained server bundle for the Cloud Run container image.
  output: "standalone",
  // Native / gRPC dependencies stay as Node externals.
  serverExternalPackages: ["sharp", "@google-cloud/firestore", "@google-cloud/storage"],
  poweredByHeader: false,
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

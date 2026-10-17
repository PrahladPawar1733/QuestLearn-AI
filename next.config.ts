import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Dev only: allow opening the app via this machine's LAN IP (e.g. http://192.168.1.10:3000 or a
// phone on the same Wi-Fi). Next blocks dev scripts from other hosts by default, so the page never
// hydrated and nothing (file picker, uploads) worked.
const lanHosts = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n!.address);

const nextConfig: NextConfig = {
  // Every page is per-student (guest cookie, live progress), so we render on
  // request rather than using Cache Components / partial prerendering.
  cacheComponents: false,
  // Self-contained server bundle for the Cloud Run container image.
  output: "standalone",
  // Native / gRPC dependencies stay as Node externals.
  serverExternalPackages: ["sharp", "@google-cloud/firestore", "@google-cloud/storage"],
  poweredByHeader: false,
  allowedDevOrigins: lanHosts,
  experimental: {
    // proxy.ts makes Next buffer request bodies, silently truncating at 10 MB by default,
    // which corrupted multi-photo uploads. Must exceed limits.maxTotalBytes (40 MB) + multipart overhead.
    proxyClientMaxBodySize: "45mb",
  },
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

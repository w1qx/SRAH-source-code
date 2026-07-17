import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the workspace root to THIS app. Without it Next infers the root from stray
  // lockfiles above the repo (e.g. ~/package-lock.json on a dev Mac) and nests the
  // standalone output under the machine's directory layout — .next/standalone/server.js
  // then lands somewhere else and pm2 on the droplet crash-loops on MODULE_NOT_FOUND.
  // @shared imports are types-only, so runtime tracing never needs anything above this dir.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;

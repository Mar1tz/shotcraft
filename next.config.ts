import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // A self-contained server for the Docker image (only the files it needs).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;

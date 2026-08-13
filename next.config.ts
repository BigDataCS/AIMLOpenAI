import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  // The E2B preview proxies requests from https://{port}-{sandbox}.e2b.app
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;

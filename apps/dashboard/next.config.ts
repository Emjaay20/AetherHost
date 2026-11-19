import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;

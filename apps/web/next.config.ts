import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Hostinger runs a custom unified server (server.js → @wma/host).
  // Do not use `output: "standalone"` here — the host process serves Next.
  transpilePackages: ["@wma/db"],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@wma/db": path.resolve(__dirname, "../../packages/db/src"),
    };
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Required for Hostinger Node.js / Passenger — without this you get 403
  output: "standalone",
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

import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Hostinger publish often strips hidden folders like `.next`.
  // Use a non-dot output dir so build artifacts survive deploy.
  distDir: "next-build",
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

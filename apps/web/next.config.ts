import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve("../.."),
  transpilePackages: ["@class-reflect/api-contracts", "@class-reflect/shared-types"],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@class-reflect/api-contracts": path.resolve("../../packages/api-contracts/src/index.ts"),
      "@class-reflect/shared-types": path.resolve("../../packages/shared-types/src/index.ts")
    };
    return config;
  }
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve("../.."),
  transpilePackages: ["@class-reflect/api-contracts", "@class-reflect/shared-types"]
};

export default nextConfig;

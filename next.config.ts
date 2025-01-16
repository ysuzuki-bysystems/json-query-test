import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  output: "export",
  serverExternalPackages: ["@duckdb/duckdb-wasm"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env["BASEPATH"],
  trailingSlash: true,
  output: "export",
  serverExternalPackages: ["@duckdb/duckdb-wasm"],
};

export default nextConfig;

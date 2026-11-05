import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the database drivers out of the bundler: `pg` must load its native
  // pieces at runtime, and PGlite ships a WASM binary.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],

  // The floating dev badge sits on top of the design in screenshots.
  devIndicators: false,
};

export default nextConfig;

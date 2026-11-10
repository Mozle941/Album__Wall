import type { NextConfig } from "next";

const config: NextConfig = {
  // Vercel's adapter uses managed output; Docker builds still need standalone.
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["sharp"],
};

export default config;

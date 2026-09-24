import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server.js + only the node_modules it actually needs,
  // instead of shipping the whole node_modules tree -- what the Dockerfile
  // build (for Coolify) copies into the final image.
  output: "standalone",
};

export default nextConfig;

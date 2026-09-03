import type { NextConfig } from "next";

import path from "node:path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias["cloudflare:workers"] = path.resolve(
      process.cwd(),
      "lib/cloudflare-workers-shim.ts"
    );
    return config;
  },
};

export default nextConfig;

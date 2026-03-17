import crypto from "node:crypto";
import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

function getBuildVersion(): string {
  // Use git commit hash for uniqueness, prefixed with package version for readability
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    return `${pkg.version}-${sha}`;
  } catch {
    return `${pkg.version}-${crypto.randomUUID().slice(0, 8)}`;
  }
}

const buildVersion = getBuildVersion();

const nextConfig: NextConfig = {
  output: "standalone",
  generateBuildId: async () => buildVersion,
  env: {
    NEXT_PUBLIC_SW_VERSION: buildVersion,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

import path from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = {
  typescript: {
    tsconfigPath:
      process.env.CLASSLEDGER_TARGET === "postgres"
        ? "tsconfig.postgres.json"
        : "tsconfig.json",
  },
  serverExternalPackages: ["pg", "bullmq"],
  webpack(config) {
    config.resolve.alias["@runtime"] = path.resolve(
      process.env.CLASSLEDGER_TARGET === "postgres"
        ? "lib/server/node-runtime.ts"
        : "lib/server/cloudflare-runtime.ts",
    );
    return config;
  },
};
export default config;

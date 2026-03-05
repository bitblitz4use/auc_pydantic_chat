import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Note: We use webpack instead of Turbopack (via --webpack flag in package.json)
  // as a workaround for Windows junction point issues with pnpm symlinks.
  // This can be removed once Turbopack properly supports pnpm on Windows.
};

export default nextConfig;

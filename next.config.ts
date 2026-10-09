import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The social slide renderer reads its brand fonts from disk
  // (lib/social/renderSlides.tsx); ship them with the routes that render.
  outputFileTracingIncludes: {
    "/api/social/**": ["./public/fonts/social/**"],
    "/api/cron/social-publish": ["./public/fonts/social/**"],
  },
};

export default nextConfig;

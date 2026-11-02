import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The social slide renderer reads its fonts and textures from disk
  // (lib/social/renderSlides.tsx); ship them with the routes that render.
  outputFileTracingIncludes: {
    "/api/social/**": ["./public/fonts/social/**", "./public/textures/social/**"],
    "/api/cron/social-publish": ["./public/fonts/social/**", "./public/textures/social/**"],
    // Report Excel files draw their tab buttons with Figtree (lib/reports/excelButtons.ts).
    "/api/reports/**": ["./public/fonts/social/Figtree-600.ttf"],
    "/api/cron/reports": ["./public/fonts/social/Figtree-600.ttf"],
  },
};

export default nextConfig;

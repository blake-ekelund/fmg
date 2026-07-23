import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the "@/*" path alias from tsconfig so modules under lib/ that
  // import via "@/..." resolve under test the same way they do in Next.
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: [
      "scripts/**/*.test.ts",
      "components/**/*.test.ts",
      "lib/**/*.test.ts",
    ],
    environment: "node",
  },
});

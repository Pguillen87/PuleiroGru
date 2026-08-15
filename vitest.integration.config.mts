import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL(".", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests-unit/server-only.ts", import.meta.url)),
  } },
  test: {
    environment: "node",
    restoreMocks: true,
    include: ["tests-integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});

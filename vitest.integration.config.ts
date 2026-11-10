import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/integration/setup.ts"],
    globalSetup: ["./tests/integration/globalSetup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    clearMocks: true,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});

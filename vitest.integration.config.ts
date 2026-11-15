import { defineConfig } from "vitest/config";

// Integration tests are parked until the routes and business logic are finalized.
export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		setupFiles: ["./tests/integration/setup.ts"],
		globalSetup: ["./tests/integration/globalSetup.ts"],
		include: [],
		passWithNoTests: true,
		clearMocks: true,
		fileParallelism: false,
		maxWorkers: 1,
		testTimeout: 30000,
		hookTimeout: 60000,
	},
});

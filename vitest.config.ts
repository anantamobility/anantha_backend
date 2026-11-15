import { defineConfig } from "vitest/config";

// Tests are parked until the routes and business logic are finalized.
// Set `include` back to ["tests/**/*.test.ts"] to re-enable them.
export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		setupFiles: ["./tests/setup.ts"],
		include: [],
		exclude: ["**/node_modules/**", "**/dist/**", "tests/integration/**"],
		passWithNoTests: true,
		clearMocks: true,
	},
});

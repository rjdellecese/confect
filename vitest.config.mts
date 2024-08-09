import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		setupFiles: ["./test/setup.ts"],
		coverage: {
			thresholds: {
				statements: 100,
				branches: 100,
				functions: 90, // Coverage bug prevents us from setting this to 100%
				lines: 100,
			},
		},
		typecheck: {
			include: ["**/*.{test,spec}{-d,}.?(c|m)[jt]s?(x)"],
		},
	},
});

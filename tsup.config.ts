import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/data-model/index.ts",
		"src/ctx/index.ts",
		"src/functions/index.ts",
		"src/schema/index.ts",
		"src/schemas/index.ts",
	],
	dts: true,
	sourcemap: true,
	clean: true,
	format: ["esm", "cjs"],
});

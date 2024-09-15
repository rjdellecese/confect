import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/server/index.ts", "src/react/index.ts"],
	dts: true,
	sourcemap: true,
	clean: true,
	format: ["esm", "cjs"],
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  plugins: [react()],
  run: {
    tasks: {
      codegen: {
        // Codegen writes into the repo (`confect/_generated/` and the wrapper
        // modules under `convex/`) rather than producing a cacheable build
        // artifact, so always run it.
        cache: false,
        command: "confect codegen",
        dependsOn: [{ task: "build", from: "dependencies" }],
      },
    },
  },
});

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
        cache: false,
        command: "confect codegen",
        dependsOn: [{ task: "build", from: "dependencies" }],
      },
    },
  },
});

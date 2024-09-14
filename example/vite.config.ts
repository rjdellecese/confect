import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		host: "127.0.0.1",
	},
	plugins: [react()],
});

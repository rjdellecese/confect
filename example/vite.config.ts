import { defineConfig } from "vite";
import react from '@vitejs/plugin-react'

export default defineConfig({
	server: {
		host: "127.0.0.1",
	},
	plugins: [react()],
});

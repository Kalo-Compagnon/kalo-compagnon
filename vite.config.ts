import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { host: "0.0.0.0", proxy: { '/api/fit-monitoring': 'http://127.0.0.1:8787' } },
  build: { chunkSizeWarningLimit: 1500 },
});

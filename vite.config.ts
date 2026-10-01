import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react(), {
    name: 'development-entry',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') req.url = '/app.html';
        next();
      });
    },
  }],
  server: { host: "0.0.0.0", proxy: { '/api/fit-monitoring': 'http://127.0.0.1:8787' } },
  build: { chunkSizeWarningLimit: 1500, rollupOptions: { input: 'app.html' } },
});

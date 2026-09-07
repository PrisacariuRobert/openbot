import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { input: { app: "index.html", studio: "studio.html" } },
  },
  server: {
    host: "127.0.0.1",
    port: 4310,
    proxy: {
      "/api": "http://127.0.0.1:4311",
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/static/frontend/" : "/",
  plugins: [react()],
  build: {
    outDir: "../app/static/frontend",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "assets/app.css";
          }
          return "assets/[name][extname]";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
}));

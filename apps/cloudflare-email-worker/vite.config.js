import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/index.js",
      fileName: () => "worker.mjs",
      formats: ["es"]
    },
    outDir: "dist",
    target: "es2022",
    rollupOptions: {
      output: {
        exports: "named"
      }
    }
  }
});

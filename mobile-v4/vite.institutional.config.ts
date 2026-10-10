import { defineConfig } from "vite";

/** Explicit host module, separate from the public Pages shell. */
export default defineConfig({
  publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    minify: true,
    outDir: "dist-institutional",
    lib: {
      entry: "src/institutional.tsx",
      formats: ["es"],
      fileName: "institutional",
      cssFileName: "institutional",
    },
  },
});

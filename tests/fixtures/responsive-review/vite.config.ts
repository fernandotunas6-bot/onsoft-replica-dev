import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  publicDir: `${repository}/public`,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": `${repository}/src` } },
  server: { host: "127.0.0.1", port: 3016, strictPort: true, fs: { allow: [repository] } },
});

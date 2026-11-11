import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  plugins: [react()],
  publicDir: local("../../../.output/public"),
  cacheDir: local("../../../node_modules/.vite-studio-qa"),
  resolve: {
    alias: [
      { find: "@/features/auth/use-current-account", replacement: local("./account.ts") },
      {
        find: /^(?:@\/features\/school-website\/content-server|\.\.\/content-server)$/,
        replacement: local("./server.ts"),
      },
      { find: "@", replacement: local("../../../src") },
    ],
  },
});

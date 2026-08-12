import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Runner de testes novo para este projecto — antes não havia nenhum.
// Os testes de integração em tests/people e tests/students precisam de um
// Postgres real (local via `supabase start`, ou o projecto remoto) e ficam
// a saltar automaticamente (`describe.skipIf`) quando SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// não estão definidos no ambiente.
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // vite-tsconfig-paths só descobre projectos dentro de `include` do tsconfig
    // (que não cobre tests/); alias explícito garante que "@/..." resolve sempre.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});

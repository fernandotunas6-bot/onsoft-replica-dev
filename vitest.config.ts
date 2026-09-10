import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Runner de testes novo para este projecto — antes não havia nenhum.
// Os testes de integração em tests/people e tests/students precisam de um
// Postgres real (local via `supabase start`, ou o projecto remoto) e ficam
// a saltar automaticamente (`describe.skipIf`) quando SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// não estão definidos no ambiente.
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    // vite-tsconfig-paths só descobre projectos dentro de `include` do tsconfig
    // (que não cobre tests/); alias explícito garante que "@/..." resolve sempre.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // `node` continua a ser o ambiente por omissão: os ~160 ficheiros de testes
    // de lógica não precisam de DOM e arrancar jsdom para todos custava tempo.
    // Os testes de componente pedem jsdom com o docblock `@vitest-environment
    // jsdom` no topo do ficheiro (o `environmentMatchGlobs` foi removido no
    // Vitest 4).
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});

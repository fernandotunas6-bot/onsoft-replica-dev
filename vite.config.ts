// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import type { NitroConfig } from "nitro/types";

// O adaptador Lovable encaminha estas opções, mas expõe um tipo mais estreito.
// Valida-se com o contrato Nitro antes de as passar ao adaptador.
const publicAssetCache = {
  routeRules: {
    "/auth-classroom.mp4": {
      headers: { "cache-control": "public, max-age=604800, stale-while-revalidate=2592000" },
    },
    "/fonts/**": {
      headers: { "cache-control": "public, max-age=604800, stale-while-revalidate=2592000" },
    },
    "/icons/**": {
      headers: { "cache-control": "public, max-age=604800, stale-while-revalidate=2592000" },
    },
    "/brands/**": {
      headers: { "cache-control": "public, max-age=604800, stale-while-revalidate=2592000" },
    },
  },
} satisfies NitroConfig;

export default defineConfig({
  vite: {
    plugins: [mcpPlugin()],
    environments: {
      client: {
        build: {
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [
                  // Cada ícone do lucide virava um ficheiro (~190 com menos de 2 KB);
                  // em HTTP/1.1 dezenas de pedidos atrasam o primeiro conteúdo.
                  { name: "icons", test: /node_modules[\\/]lucide-react/ },
                  // O núcleo que todas as páginas carregam, num só ficheiro em vez de dezenas.
                  {
                    name: "framework",
                    test: /node_modules[\\/](react|react-dom|scheduler|@tanstack[\\/](react-router|router-core|history|react-query|query-core|store|react-store)|clsx|tailwind-merge|tslib)[\\/]/,
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
  react: {
    jsxRuntime: "automatic",
  },
  nitro: {
    /**
     * O alvo de publicação é sempre o `cloudflare-module`. A variável existe só
     * para medir o build de produção localmente: o `wrangler` exige macOS 13.5+ e
     * `vite preview` procura o build em `dist/server/`, que este projecto não usa.
     * Com `SIGA_NITRO_PRESET=node-server` sai uma saída servível por Node, para
     * Lighthouse e ensaios de navegador. Nome próprio de propósito — não é o
     * `NITRO_PRESET` que o Nitro ou um CI possam definir sem ser de propósito.
     * Nunca definir isto num workflow de publicação.
     */
    preset: process.env["SIGA_NITRO_PRESET"] ?? "cloudflare-module",
    // Nomes sem hash: prazo finito, para uma substituição chegar aos visitantes.
    // Nitro gera também o _headers dos assets Cloudflare a partir destas regras.
    ...publicAssetCache,
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // E o cliente para src/client.tsx — a entrada por omissão do pacote vive
    // num subcaminho fora do `exports` e o Vite 8 não a consegue resolver.
    client: { entry: "client" },
  },
});

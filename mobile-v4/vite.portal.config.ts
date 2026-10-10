import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

// Build da app em m.portal-siga.com, com as dependências da raiz (cliente
// Supabase e verificação do portal). Corre com `npm run mobile:build` na raiz.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default {
  root: here("./portal"),
  base: "/mobile/",
  publicDir: here("./public"),
  envDir: here(".."),
  plugins: [react()],
  resolve: { alias: { "@": here("../src") } },
  define: { "process.env": "{}" },
  build: { outDir: here("../public/mobile"), emptyOutDir: true },
};

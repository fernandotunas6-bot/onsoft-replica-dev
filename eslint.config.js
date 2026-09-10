import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      // Cada painel do ecossistema tem o seu próprio eslint.config e o seu
      // próprio script `lint` (ver painel/*/package.json). Lintá-los a partir
      // da raiz analisava ~490 ficheiros com um config que não é o deles
      // (outro tsconfig, outros globals) — só produzia ruído e ~10 min de CPU.
      "painel/**",
      // Ficheiros gerados: nunca editados à mão, não há nada a corrigir neles.
      "**/*.gen.ts",
      "src/integrations/supabase/types.ts",
      ".claude/**",
      // Artefactos de build do Tauri/Rust — o flat config não lê .gitignore,
      // e sem isto o lint analisava JS gerado dentro de src-tauri/target/.
      "src-tauri/target/**",
      "src-tauri/gen/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Aviso, não erro: há ~100 `any` legítimos nas fronteiras não tipadas
      // (RPC Supabase que devolve Json, payloads de importação). Mantê-los
      // como "error" tornava o lint sempre vermelho e foi o que levou a
      // desligar o gate na CI — com "warn" continuam visíveis no relatório
      // sem mascarar erros a sério como `react-hooks/rules-of-hooks`.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  eslintPluginPrettier,
);

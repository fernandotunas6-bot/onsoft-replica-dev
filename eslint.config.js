import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // painel/* (WEB, ADMIN, DOC) e "modelo de pautas" têm configuração própria:
    // manter aqui só o SIGA para os avisos serem legíveis.
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "painel/**",
      "modelo de pautas/**",
      "playwright-report/**",
      "reports/**",
      // Ficheiros gerados automaticamente pela integração Lovable Cloud.
      "src/integrations/supabase/previewAuthStorage.ts",
      "src/integrations/supabase/types.ts",
      "src/routeTree.gen.ts",
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
    },
  },
  {
    // Testes e scripts de manutenção usam duplos de teste e respostas externas
    // sem forma fixa: `any` é aceitável fora do código da aplicação.
    files: ["tests/**/*.{ts,tsx}", "scripts/**/*.{ts,mjs}", "*.config.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  eslintPluginPrettier,
);

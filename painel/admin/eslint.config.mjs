import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16 já exporta flat config; o `next lint` deixou de existir.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    // Regras novas do React Compiler (react-hooks 7). As páginas carregam os
    // dados com `useEffect(() => void load(), [load])`, que é correcto mas esta
    // regra marca; e o `Math.random()` do sidebar/chat é de maquetas. Ficam
    // como aviso até cada página migrar para um carregamento sem efeito.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;

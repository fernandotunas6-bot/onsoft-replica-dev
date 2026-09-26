import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // This client-only dashboard loads remote data and browser preferences in
      // effects. Those updates are intentional synchronisation points.
      "react-hooks/set-state-in-effect": "off",
      // TanStack Table intentionally returns non-memoizable callbacks.
      "react-hooks/incompatible-library": "off",
      // Platform-admin avatars and service icons come from tenant-controlled hosts.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;

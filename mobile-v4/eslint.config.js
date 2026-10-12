import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", "reference/**"] },
  {
    files: [
      "src/**/*.{ts,tsx}",
      "staging/**/*.{ts,tsx}",
      "tests/**/*.{ts,tsx}",
      "public/_worker.js",
    ],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": hooks },
    rules: { ...hooks.configs.recommended.rules, "@typescript-eslint/no-unused-vars": "error" },
  },
);

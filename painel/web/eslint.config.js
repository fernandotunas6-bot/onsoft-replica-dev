import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    // eslint-plugin-react-hooks@7 e eslint-plugin-react-refresh@0.4 exportam
    // `configs.recommended-latest`/`configs.vite` com `plugins` como array de
    // strings (formato eslintrc antigo) em vez do objecto que o flat config
    // exige — `extends` rebenta com "plugins key defined as an array of
    // strings". Regista os plugins à mão e só aproveita as `rules` de cada
    // config pronta (essas estão correctas). Mesmo padrão do eslint.config.js
    // da raiz (SIGA), que usa a v5 do react-hooks sem este problema.
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      ...reactRefresh.configs.vite.rules,
      // Convenção padrão: `_nome` marca uma desestruturação/argumento
      // deliberadamente ignorado (ex.: descartar um campo antes de enviar a
      // um endpoint) sem desligar a regra para o resto do ficheiro.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Iguais ao ADMIN e ao SIGA: regras novas do React Compiler e do fast refresh
      // ficam como aviso. São sobretudo componentes do kit (ui/*, sidebar, chat) e
      // hooks que sincronizam com o browser; migram página a página.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
])

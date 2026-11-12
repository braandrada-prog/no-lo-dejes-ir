import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Solo se analiza el código fuente: nada generado, nativo ni de Deno.
  globalIgnores([
    'dist',
    'build',
    'coverage',
    'android',
    'ios',
    'supabase', // Edge Functions (Deno): se validan con `deno check` / `deno lint`
    'mi-proyecto-supabase',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Archivos de configuración de herramientas: corren en Node, no en el navegador.
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },
])

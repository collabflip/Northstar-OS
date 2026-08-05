import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Library-style modules that intentionally co-export helpers, constants,
    // or hooks alongside components (shadcn/ui convention, i18n provider,
    // tRPC client, nav config). The rule only affects dev HMR fidelity, not
    // correctness; splitting these modules would churn every importer.
    files: [
      'src/components/ui/**/*.{ts,tsx}',
      'src/components/evidence/**/*.{ts,tsx}',
      'src/components/Navbar.tsx',
      'src/providers/**/*.{ts,tsx}',
      'src/lib/i18n.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])

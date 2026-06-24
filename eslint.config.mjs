import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'scripts/**',
      '**/*.cjs',
      // Config files use require() by necessity (CommonJS/Tailwind loader) — exclude from TS lint
      'tailwind.config.js',
      'postcss.config.js',
      '*.config.js'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier,
  // Boundary: renderer must not import from main (use shared/ + IPC bridge only)
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/main/**',
                '../main/*',
                '../../main/*',
                '../../../main/*',
                '../../../../main/*',
                '../../../../../main/*'
              ],
              message: 'renderer는 main을 직접 import할 수 없습니다. shared/ + IPC만 사용하세요.'
            }
          ]
        }
      ]
    }
  },
  // Boundary: core must not import electron (pure core, dependencies injected)
  {
    files: ['src/main/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'core는 electron 비의존이어야 합니다(의존성 주입).'
            }
          ]
        }
      ]
    }
  },
  // File size: warn when a file exceeds 250 lines (excluding blanks and comments)
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['warn', { max: 250, skipBlankLines: true, skipComments: true }]
    }
  },
  // TS strict inference is reliable for return types; explicit annotations add noise on
  // React components and internal functions. Architecture/correctness rules are kept.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Downgrade no-explicit-any to warn (not off) so boundary/test `any` casts surface
      // without blocking CI. Prefer precise types where trivial.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow _-prefixed params in interface implementations (required signatures)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ]
    }
  },
  // shadcn/ui files export variant helpers alongside components (standard shadcn pattern).
  // Disabling react-refresh only for the generated UI component directory.
  {
    files: ['src/renderer/src/components/ui/**'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  }
)

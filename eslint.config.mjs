import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'scripts/**', '**/*.cjs'] },
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
              message:
                'renderer는 main을 직접 import할 수 없습니다. shared/ + IPC만 사용하세요.'
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
  }
)

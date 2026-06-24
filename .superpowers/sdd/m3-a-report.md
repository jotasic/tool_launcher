# M3-A: ESLint Boundary Guardrails Report

## Rules Added

Three config objects appended to `eslint.config.mjs`:

### 1. Renderer → Main Boundary (`no-restricted-imports`, error)
- **Files**: `src/renderer/**/*.{ts,tsx}`
- **Blocks**: relative imports matching `**/main/**`, `../main/*`, `../../main/*`, `../../../main/*`, `../../../../main/*`, `../../../../../main/*`
- **Message**: `renderer는 main을 직접 import할 수 없습니다. shared/ + IPC만 사용하세요.`

### 2. Core → Electron Boundary (`no-restricted-imports`, error)
- **Files**: `src/main/core/**/*.ts`
- **Blocks**: named import of `electron` package
- **Message**: `core는 electron 비의존이어야 합니다(의존성 주입).`

### 3. File Size Limit (`max-lines`, warn)
- **Files**: `src/**/*.{ts,tsx}`
- **Limit**: 250 lines (skipBlankLines: true, skipComments: true)
- **Severity**: warn (lint still passes)

### Ignores Update
Added `scripts/**` and `**/*.cjs` to the top-level `ignores` block so `scripts/capture.cjs` (CommonJS utility) no longer causes `@typescript-eslint/no-require-imports` errors.

## Boundary Rule Proofs

### Proof 1: renderer → main
Temporarily added `import '../../main/index'` to `src/renderer/src/App.tsx`:
```
/Users/taewookim/dev/tool_launcher/src/renderer/src/App.tsx
  2:1  error  '../../main/index' import is restricted from being used by a pattern.
              renderer는 main을 직접 import할 수 없습니다. shared/ + IPC만 사용하세요.
              no-restricted-imports
```
Removed temp import → lint clean.

### Proof 2: core → electron
Temporarily added `import { app } from 'electron'` to `src/main/core/store.ts`:
```
/Users/taewookim/dev/tool_launcher/src/main/core/store.ts
  1:1  error  'electron' import is restricted from being used.
              core는 electron 비의존이어야 합니다(의존성 주입).
              no-restricted-imports
```
Removed temp import → lint clean.

## Lint Output (clean state)
- `npm run lint` exits with pre-existing errors (32 non-prettier errors existed in baseline — `@typescript-eslint/explicit-function-return-type`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`, `react-refresh/only-export-components`).
- **Zero new errors** from our three added rules on existing code.
- `scripts/capture.cjs` correctly ignored — no `no-require-imports` errors.

## Test Results
```
Test Files  8 passed (8)
     Tests  42 passed (42)
  Duration  1.16s
```

## Files Changed
- `eslint.config.mjs` — added `scripts/**`, `**/*.cjs` to ignores; appended 3 boundary rule config objects.

## Concerns
- The project baseline already has 32 errors from `@typescript-eslint/explicit-function-return-type`, `@typescript-eslint/no-explicit-any`, etc. These predate this task and are not caused by the boundary rules.
- `max-lines` at 250 may begin warning on `ProgramForm.tsx` or `SettingsDialog.tsx` as those grow — expected behavior.
- The renderer→main glob `**/main/**` also catches any hypothetical path with "main" in the middle; if a non-main utility folder were named e.g. `src/renderer/src/domain/` this wouldn't trigger — no current false-positives detected.

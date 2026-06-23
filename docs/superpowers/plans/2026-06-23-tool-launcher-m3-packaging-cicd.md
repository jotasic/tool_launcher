# Tool Launcher M3 — 패키징 · CI/CD · 품질 가드레일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3 OS 설치 패키지 빌드, GitHub Actions CI(테스트)→CD(빌드/릴리즈) 파이프라인, release-please 기반 버전·릴리즈 자동화, 그리고 코드 경계·커밋 규율을 lint로 강제한다.

**Architecture:** electron-builder로 mac/win/linux 설치 파일 생성. CI는 PR/푸시마다 3 OS 매트릭스로 lint·typecheck·test. release-please가 main 머지를 Release PR로 누적하고, Release PR 머지 시 태그+GitHub Release 생성 → 그 릴리즈가 빌드 워크플로를 트리거해 설치 파일을 첨부.

**Tech Stack:** electron-builder, GitHub Actions, release-please-action, ESLint(flat config) + import 경계 규칙, Prettier, husky, lint-staged, commitlint.

## Global Constraints

- 빌드 타깃: macOS `.dmg`, Windows NSIS `.exe`, Linux `.AppImage` + `.deb`.
- CI는 ubuntu-latest / macos-latest / windows-latest 3 매트릭스.
- 릴리즈 트리거: release-please가 생성한 GitHub Release(`release: published`). 평소 main 머지는 릴리즈하지 않음.
- 커밋 메시지는 Conventional Commits — commitlint로 강제.
- renderer는 `src/main/**`를 import 금지 — ESLint로 강제.
- 코드 서명·공증, 앱 내 자동 업데이트는 범위 밖(미서명 빌드).

---

### Task 1: ESLint 경계 규칙 + Prettier

**Files:**
- Create/Modify: `eslint.config.js`
- Create: `.prettierrc.json`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `npm run lint`, `npm run format`. renderer→main import 시 lint 에러.

- [ ] **Step 1: 의존성**

```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks prettier eslint-config-prettier
```

- [ ] **Step 2: flat config 작성**

Create/replace `eslint.config.js`:

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['out', 'dist', 'node_modules', '**/*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'max-lines': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // 경계: renderer는 main을 직접 import 금지
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/main/**', '../../main/*', '@/main/*'], message: 'renderer는 main을 직접 import할 수 없습니다. shared/ + IPC만 사용하세요.' },
        ],
      }],
    },
  },
  {
    // 경계: core는 electron import 금지
    files: ['src/main/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'electron', message: 'core는 electron 비의존이어야 합니다(주입식 의존성 사용).' }],
      }],
    },
  },
  prettier,
)
```

- [ ] **Step 3: Prettier 설정 + scripts**

Create `.prettierrc.json`:

```json
{ "semi": false, "singleQuote": true, "printWidth": 100 }
```

`package.json` scripts에 추가/확인:

```json
"lint": "eslint .",
"format": "prettier --write .",
"typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json"
```

> electron-vite 템플릿에 `tsconfig.node.json`/`tsconfig.web.json`이 있으면 위 경로 사용. 없으면 존재하는 tsconfig로 교체.

- [ ] **Step 4: 경계 규칙 동작 확인**

`src/renderer/App.tsx` 상단에 임시로 `import '../main/main'` 추가 → `npm run lint` → 에러 발생 확인 → 임시 import 제거.

Run: `npm run lint`
Expected: 위 임시 import 시 "renderer는 main을 직접 import할 수 없습니다" 에러. 제거 후 통과(기존 코드 경고만).

- [ ] **Step 5: 포맷 적용 + Commit**

```bash
npm run format
npm run lint
git add -A
git commit -m "chore: add ESLint boundary rules and Prettier config"
```

---

### Task 2: husky + lint-staged + commitlint

**Files:**
- Create: `.husky/pre-commit`, `.husky/commit-msg`
- Create: `commitlint.config.js`
- Modify: `package.json` (lint-staged 설정)

**Interfaces:**
- Produces: 커밋 시 자동 typecheck/lint/format(staged) + 커밋 메시지 Conventional Commits 검증.

- [ ] **Step 1: 의존성 + husky 초기화**

```bash
npm install -D husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init
```

- [ ] **Step 2: commitlint 설정**

Create `commitlint.config.js`:

```js
export default { extends: ['@commitlint/config-conventional'] }
```

- [ ] **Step 3: lint-staged 설정**

`package.json`에 추가:

```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,css,md}": ["prettier --write"]
}
```

- [ ] **Step 4: 훅 작성**

`.husky/pre-commit` 내용:

```sh
npx lint-staged
npm run typecheck
```

Create `.husky/commit-msg`:

```sh
npx --no -- commitlint --edit "$1"
```

- [ ] **Step 5: 동작 확인**

잘못된 메시지로 커밋 시도:

```bash
git commit --allow-empty -m "bad message"
```

Expected: commitlint가 거부. 올바른 형식은 통과:

```bash
git commit --allow-empty -m "chore: verify commit hooks"
```

Expected: 통과.

- [ ] **Step 6: Commit**

```bash
git add .husky commitlint.config.js package.json
git commit -m "chore: add husky, lint-staged, commitlint for commit-time guardrails"
```

---

### Task 3: CONVENTIONS.md

**Files:**
- Create: `CONVENTIONS.md`

**Interfaces:**
- Produces: 코드 규칙 문서.

- [ ] **Step 1: 문서 작성**

Create `CONVENTIONS.md`:

```markdown
# 코드 컨벤션

## 구조
- `src/shared` : main/renderer 공유 타입 + IPC 계약. 단일 진실원.
- `src/main/core` : 순수 로직. electron import 금지. 의존성은 주입.
- `src/main/ipc`, `src/main/*.ts` : electron 연결(얇게).
- `src/preload` : 타입 있는 화이트리스트 브리지.
- `src/renderer` : React UI. main 직접 import 금지(shared + IPC만).

## 경계 (ESLint로 강제)
- renderer → main import 금지.
- core → electron import 금지.
- 파일 250줄 초과 시 경고 → 분리.

## UI
- 상태관리 Zustand(도메인별 스토어). prop drilling/Context 떡칠 금지.
- presentational 컴포넌트는 props만, IPC 직접 호출 금지.
- 파일 1개 = 컴포넌트 1개. 스타일은 Tailwind + shadcn/ui.

## 커밋 (commitlint로 강제)
- Conventional Commits: feat/fix/chore/docs/test/refactor 등.
- release-please가 이 메시지로 버전·CHANGELOG를 산정.

## 테스트
- core 로직은 단위 테스트 필수(Vitest). 의존성 주입으로 격리.
- 실제 프로세스/네트워크는 통합 테스트에서만.
```

- [ ] **Step 2: Commit**

```bash
git add CONVENTIONS.md
git commit -m "docs: add CONVENTIONS.md"
```

---

### Task 4: electron-builder 패키징 설정 (3 OS)

**Files:**
- Create/Modify: `electron-builder.yml`
- Create: `build/icon.png` (512x512, mac/linux), `build/icon.ico` (Windows)
- Modify: `package.json` (build scripts, version, repository 필드)

**Interfaces:**
- Produces: `npm run build:mac|win|linux` → `dist/`에 설치 파일.

- [ ] **Step 1: 빌더 설정**

Create/replace `electron-builder.yml`:

```yaml
appId: com.taewookim.toollauncher
productName: Tool Launcher
directories:
  output: dist
  buildResources: build
files:
  - out/**
extraResources:
  - resources/**
mac:
  target: [dmg]
  category: public.app-category.developer-tools
  icon: build/icon.png
win:
  target: [nsis]
  icon: build/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
linux:
  target: [AppImage, deb]
  category: Development
  icon: build/icon.png
publish:
  provider: github
```

- [ ] **Step 2: package.json 보강**

`package.json`에 다음 필드가 있는지 확인/추가(release-please와 electron-builder가 사용):

```json
"version": "0.0.0",
"repository": { "type": "git", "url": "https://github.com/<owner>/tool_launcher.git" },
"author": "taewookim",
"scripts": {
  "build": "electron-vite build",
  "build:mac": "electron-vite build && electron-builder --mac",
  "build:win": "electron-vite build && electron-builder --win",
  "build:linux": "electron-vite build && electron-builder --linux"
}
```

`<owner>`를 실제 GitHub 사용자/조직으로 교체.

- [ ] **Step 3: 아이콘 배치**

`build/icon.png`(512x512), `build/icon.ico` 준비. 임시로 단색 아이콘 가능(정식 아이콘은 후속). `electron-icon-builder` 등으로 png→ico 변환 가능:

```bash
npx electron-icon-builder --input=build/icon.png --output=build
```

- [ ] **Step 4: 로컬 빌드 확인 (현재 OS)**

macOS에서:

```bash
npm run build:mac
```

Expected: `dist/`에 `.dmg` 생성. 설치/실행 시 동작 확인(미서명이라 Gatekeeper 경고는 정상 — 우클릭 열기).

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml package.json build
git commit -m "build: configure electron-builder for mac/win/linux installers"
```

---

### Task 5: CI 워크플로 (테스트)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: PR/푸시마다 3 OS에서 lint·typecheck·test 실행.

- [ ] **Step 1: 워크플로 작성**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 2: 로컬에서 동일 명령 검증**

Run: `npm ci && npm run lint && npm run typecheck && npm test`
Expected: 모두 통과(이게 CI에서 돌 명령과 동일).

- [ ] **Step 3: Commit + 푸시 후 확인**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add test workflow across 3 OS matrix"
```

(원격 저장소 연결 후) 푸시 → GitHub Actions에서 CI 통과 확인. main에 branch protection을 걸어 CI 통과를 머지 필수 조건으로 설정.

---

### Task 6: release-please 워크플로

**Files:**
- Create: `.github/workflows/release-please.yml`
- Create: `release-please-config.json`, `.release-please-manifest.json`

**Interfaces:**
- Produces: main 머지 시 Release PR 생성/갱신. Release PR 머지 시 `vX.Y.Z` 태그 + GitHub Release 생성.

- [ ] **Step 1: 설정 파일**

Create `.release-please-manifest.json`:

```json
{ ".": "0.0.0" }
```

Create `release-please-config.json`:

```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "package-name": "tool-launcher"
    }
  }
}
```

- [ ] **Step 2: 워크플로 작성**

Create `.github/workflows/release-please.yml`:

```yaml
name: release-please
on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release-please.yml release-please-config.json .release-please-manifest.json
git commit -m "ci: add release-please for versioning and release PRs"
```

(원격 연결 후) main 푸시 시 release-please가 Release PR을 여는지 확인. 머지하면 태그+Release 생성됨.

---

### Task 7: CD 빌드/배포 워크플로 (릴리즈 시 설치 파일 첨부)

**Files:**
- Create: `.github/workflows/build-release.yml`

**Interfaces:**
- Consumes: release-please가 만든 GitHub Release(`release: published`).
- Produces: 3 OS에서 electron-builder로 빌드 후 설치 파일을 해당 Release에 업로드.

- [ ] **Step 1: 워크플로 작성**

Create `.github/workflows/build-release.yml`:

```yaml
name: build-release
on:
  release:
    types: [published]

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Build & publish installer
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          npm run build
          npx electron-builder --publish always
```

> `electron-builder --publish always`는 `electron-builder.yml`의 `publish: github` 설정과 `GH_TOKEN`을 사용해, 현재 태그에 해당하는 Release(이미 release-please가 생성)에 설치 파일을 업로드한다. OS별 매트릭스가 각자 자기 플랫폼 산출물을 올린다.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-release.yml
git commit -m "ci: build and attach installers to GitHub Release on publish"
```

- [ ] **Step 3: 종단 검증 (원격 연결 후)**

1. 의미 있는 변경을 `feat:`/`fix:` 커밋으로 main에 머지.
2. release-please가 Release PR을 생성/갱신하는지 확인.
3. Release PR 머지 → 태그 + GitHub Release 생성.
4. build-release 워크플로가 3 OS 빌드 후 `.dmg`/`.exe`/`.AppImage`/`.deb`를 Release 자산으로 업로드하는지 확인.

Expected: Release 페이지에 3 OS 설치 파일이 첨부됨.

---

### Task 8: GitHub 저장소 연결 + README

**Files:**
- Create: `README.md`
- Modify: `.gitignore` (dist/out 확인)

**Interfaces:**
- Produces: 원격 저장소 연결, 사용/개발 안내.

- [ ] **Step 1: .gitignore 확인**

`node_modules`, `out`, `dist`이 무시되는지 확인. 없으면 추가.

- [ ] **Step 2: README 작성**

Create `README.md`:

```markdown
# Tool Launcher

로컬 개인 프로그램(웹/GUI/CLI)을 등록해두고 데스크톱 앱에서 on/off·상태·로그·열기를 관리하는 크로스 플랫폼 런처.

## 개발
- `npm run dev` — 개발 실행
- `npm test` — 테스트
- `npm run lint` / `npm run typecheck`
- `npm run build:mac|win|linux` — 설치 파일 빌드

## 릴리즈
Conventional Commits로 main에 머지 → release-please가 Release PR 누적 → Release PR 머지 시 태그+Release 생성 → CI가 3 OS 설치 파일 첨부.

## 문서
- 설계: `docs/superpowers/specs/2026-06-23-tool-launcher-design.md`
- 규칙: `CONVENTIONS.md`
```

- [ ] **Step 3: 원격 연결 + 푸시**

```bash
gh repo create tool_launcher --private --source=. --remote=origin
git push -u origin main
```

(또는 기존 빈 저장소에 `git remote add origin <url>` 후 push.) `package.json`의 `repository.url`과 일치시킨다.

- [ ] **Step 4: Commit**

```bash
git add README.md .gitignore
git commit -m "docs: add README and finalize repo setup"
git push
```

---

## Self-Review (M3)

**Spec coverage (M3 범위):**
- 3 OS 설치 패키지(.dmg/.exe/.AppImage/.deb) → Task 4 ✓
- CI(테스트, 3 OS 매트릭스) → Task 5 ✓
- release-please 릴리즈 자동화(머지 폭증 없이 버전·CHANGELOG) → Task 6 ✓
- CD(릴리즈 시 빌드·첨부) → Task 7 ✓
- 강제 가드레일(ESLint 경계, 파일 크기, husky/lint-staged, commitlint, Conventional Commits) → Task 1, 2 ✓
- CONVENTIONS.md → Task 3 ✓

**Type consistency:** 이 마일스톤은 설정/워크플로 중심으로 코드 타입 의존이 적음. `npm run typecheck`/`npm run lint`/`npm test` 스크립트 이름은 Task 1·2·5에서 일관되게 사용.

**Placeholder scan:** `<owner>`는 사용자가 채워야 하는 실제 값으로 명시(Task 4 Step 2). 아이콘은 임시 단색 허용으로 명시(Task 4 Step 3). 그 외 모든 파일 내용·명령은 구체적으로 채워짐.

**의존성 순서:** M3는 M1·M2 완료를 전제. Task 7(CD)은 Task 4(빌더)·Task 6(release-please) 완료 후 동작. 원격 저장소 연결(Task 8) 후에야 CI/CD가 실제로 돌아감 — 로컬 검증 단계는 각 태스크에 포함.
```

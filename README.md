# Tool Launcher

로컬에 있는 여러 개인 프로그램(웹/GUI/CLI)을 등록해두고, 데스크톱 앱에서 클릭 한 번으로
켜고 끄며(프로그램당 프로세스 여러 개 가능) 상태·로그를 보고, 필요하면 브라우저나 파일로
"열기"까지 하는 크로스 플랫폼(macOS/Windows/Linux) 설치형 런처. `git clone`은 프로그램
폴더를 채우는 보조 기능.

## 기술 스택

Electron · TypeScript · React · Tailwind + shadcn/ui · Zustand · Vitest · electron-builder

## 구조

```
src/
  shared/    공유 타입 + IPC 계약 (단일 진실원)
  main/
    core/    순수 로직(ProcessManager/LogStore/OpenResolver/GitService/Store), electron 비의존
    ipc/     core ↔ renderer 연결
    index.ts, tray.ts
  preload/   타입 있는 화이트리스트 브리지(window.api)
  renderer/  React UI (features/programs, features/logs, features/settings, stores, components/ui)
```

자세한 규칙은 [`CONVENTIONS.md`](./CONVENTIONS.md), 설계는
[`docs/superpowers/specs/2026-06-23-tool-launcher-design.md`](./docs/superpowers/specs/2026-06-23-tool-launcher-design.md) 참고.

## 개발

```bash
npm install
npm run dev          # 개발 실행 (Electron)
npm test             # 단위·통합 테스트 (Vitest)
npm run lint         # ESLint (renderer↛main, core↛electron 경계 강제)
npm run typecheck    # tsc (main + renderer)
```

## 빌드 (설치 패키지)

```bash
npm run build:mac    # dist/*.dmg
npm run build:win    # dist/*-setup.exe (NSIS)
npm run build:linux  # dist/*.AppImage, dist/*.deb
```

> 코드 서명·공증은 설정하지 않았습니다. 미서명 빌드라 macOS/Windows에서 최초 실행 시 경고가
> 뜰 수 있습니다(macOS는 우클릭 → 열기). 서명 인증서를 추가하면 해결됩니다.

## 릴리즈 (release-please)

1. Conventional Commits(`feat:`/`fix:` 등)로 작업해 `main`에 머지.
2. `release-please`가 변경사항을 모아 **Release PR**(버전 bump + CHANGELOG)을 자동 생성/갱신.
   평소 머지는 릴리즈되지 않음.
3. 준비되면 그 Release PR을 머지 → `vX.Y.Z` 태그 + GitHub Release 생성 →
   `build-release` 워크플로가 3 OS 설치 파일을 빌드해 릴리즈에 첨부.

## 최초 1회 설정 (GitHub 연동)

CI/CD 워크플로는 원격 저장소가 있어야 동작합니다.

```bash
gh repo create tool_launcher --private --source=. --remote=origin
git push -u origin main
```

- `package.json`의 `repository.url`과 `electron-builder.yml`의 `publish`가 실제 저장소와 일치하는지 확인.
- `main`에 branch protection을 걸어 CI 통과를 머지 필수 조건으로 설정 권장.

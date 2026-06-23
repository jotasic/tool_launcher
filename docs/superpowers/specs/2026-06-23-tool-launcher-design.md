# Tool Launcher — 설계 문서

작성일: 2026-06-23

## 1. 개요 / 목적

각종 개인용 테스트 프로그램(파이썬 웹 앱, FastAPI/React, Qt GUI 등)을 매번 스크립트로
일일이 실행하는 번거로움을 없애기 위한 **크로스 플랫폼 설치형 데스크톱 런처**.

런처에 프로그램을 등록해두고, 클릭 한 번으로 켜고 끄며(프로그램당 프로세스 여러 개 가능),
상태·로그를 보고, 필요하면 브라우저나 파일로 "열기"까지 한다.

한 문장 요약:
> 로컬에 있는 여러 개인 프로그램(웹/GUI/CLI)을 등록해두고, 데스크톱 앱에서 on/off·상태·로그·열기를
> 관리하는 크로스 플랫폼 설치형 런처. git clone은 등록을 편하게 해주는 보조 기능.

## 2. 목표와 비목표

### 목표 (v1)
- 크로스 플랫폼: macOS, Windows, Linux 모두 지원.
- 설치형 패키지로 배포(.dmg / .exe(NSIS) / .AppImage / .deb).
- 등록된 프로그램 on/off (프로그램 단위 일괄 제어).
- 프로그램당 다중 프로세스 지원(시작 순서 지정, 종료는 역순).
- 상태 표시(stopped / starting / running / error) + 프로세스별 로그 보기.
- "열기" 동작: 없음 / 정적 URL / 로그에서 URL 자동탐지 / 파일·폴더 경로.
- git clone / pull(옵션)로 프로그램 폴더 채우기.
- 창 닫으면 트레이로 최소화(프로그램 계속 실행), 명시적 종료 시 정리.
- CI/CD: GitHub Actions로 테스트·빌드·릴리즈 자동화(release-please).

### 비목표 (v1 범위 제외, YAGNI)
- 자동 재시작 / 헬스체크 / 리소스(CPU·메모리) 그래프.
- 프로세스 간 의존성·헬스 기반 순서 제어(process-compose 수준).
- 개별 프로세스 독립 on/off (프로그램 단위로만 제어).
- 자동 업데이트(앱 내 업데이트), 코드 서명·공증.
- 원격 접속 / 멀티유저 / 팀 공유.

## 3. 결정 요약

| 항목 | 결정 | 근거 |
|------|------|------|
| 인터페이스 형태 | 데스크톱 GUI 앱 | "런처" + "설치형" 요구에 부합 |
| 도입 범위 | 실행 중심, git은 옵션 | 로컬 폴더/스크립트 등록·실행이 핵심 |
| 다중 프로세스 | 프로그램 단위 일괄 on/off | "프로그램 on/off" 요구에 가장 단순하게 부합 |
| 관찰·제어 수준 | 상태 + 로그 + 열기 | 테스트 용도에 실용적 |
| "열기" 모델 | 모드 집합(로그 탐지 포함) | 웹/동적포트/네이티브 GUI 케이스 모두 커버 |
| 지원 OS | macOS, Windows, Linux | 완전 크로스 플랫폼 |
| 코어 스택 | Electron(JS/TS) | Chromium 번들로 3 OS 동일 렌더링, child_process로 프로세스 관리 자연스러움 |
| 종료 동작 | 계속 실행(트레이로) | 창 닫아도 프로그램 유지, 명시적 종료 시 정리 |
| UI 방식 | Tailwind + shadcn/ui | 일관된 디자인 시스템, 가벼운 의존성, 커스터마이즈 자유 |
| 상태관리 | Zustand | 보일러플레이트 적고 고빈도 로그 갱신에 적합 |
| 릴리즈 자동화 | release-please (Release PR 누적형) | 머지마다 릴리즈 폭증 없이 버전·체인지로그 자동, 릴리즈 시점은 의도적 제어 |

## 4. 아키텍처

```
┌─────────────────────────────────────────────┐
│  Renderer (React + TS) — UI                   │
│  프로그램 목록/카드, 토글, 로그 뷰어, 추가/편집 폼 │
└───────────────▲───────────────────────────────┘
                │ IPC (contextBridge, 화이트리스트 채널)
┌───────────────┴───────────────────────────────┐
│  Main (Node) — 핵심 로직                        │
│  ├ ProcessManager : spawn/stop/트리킬/상태       │
│  ├ LogStore       : 프로세스별 로그 버퍼+스트리밍 │
│  ├ OpenResolver   : URL/로그탐지/경로 "열기"     │
│  ├ Store          : programs.json / settings.json│
│  └ GitService     : clone / pull (옵션)          │
└────────────────────────────────────────────────┘
```

- Main 프로세스가 실제 자식 프로세스를 소유·관리. Renderer는 IPC로 명령을 보내고 상태/로그를 구독만 함.
- 보안: `contextIsolation: true`, `nodeIntegration: false`, preload로 화이트리스트 채널만 노출.

## 5. 데이터 모델

`programs.json` (Electron `userData` 폴더에 저장). 가져오기/내보내기 지원으로 PC 간 이동 가능.

```jsonc
Program {
  id, name,
  workingDir,                 // 기준 폴더
  git?: { repoUrl, branch?, autoPullOnStart? },   // 옵션
  processes: [ {
     name,                    // 라벨 (예: "backend")
     command, args?, cwd?,    // cwd 비우면 workingDir 사용
     env?,                    // 추가 환경변수
     order,                   // 시작 순서 (종료는 역순)
     startDelayMs?            // 다음 프로세스 시작 전 지연(옵션)
  } ],
  open?: {
     mode: "none" | "url" | "url-from-log" | "path",
     value?,                  // url 또는 파일/폴더 경로
     logPattern?,             // url-from-log용 정규식 (기본값 제공, 편집 가능)
     autoOpenOnStart: false   // 기본 off (자체 오픈 중복 방지)
  }
}
```

`settings.json`: 로그 버퍼 크기, 로그 파일 저장 on/off, 기본 로그 정규식, 테마 등.

## 6. 핵심 동작

### 6.1 프로세스 생명주기
- **시작**: `processes`를 `order` 순으로 `child_process.spawn`. PID 추적, stdout/stderr 캡처.
  상태 전이 `stopped → starting → running`. `startDelayMs` 있으면 다음 프로세스 전 대기.
- **종료**: 역순으로 SIGTERM → 유예시간 후 SIGKILL.
  **프로세스 트리 종료 필수** — uvicorn/vite 등은 자식 프로세스를 또 띄움.
  POSIX는 detached 프로세스 그룹 kill, Windows는 `taskkill /T /F`(또는 `tree-kill` 라이브러리)로 자식까지 정리.
- **크래시 감지**: 종료 요청이 없었는데 프로세스가 죽으면 상태 `error`로 표시(자동 재시작 안 함).

### 6.2 로그
- 프로세스별 메모리 링버퍼(최근 N줄, 설정값) + 선택적 파일 저장.
- 새 줄을 IPC로 Renderer에 스트리밍. **배치 업데이트**로 리렌더 폭주 방지.
- 로그 뷰어는 프로세스별 탭 또는 병합 보기, 자동 따라가기(tail), 지우기/복사.

### 6.3 "열기" 모델
- `mode = none`: 버튼 없음(자체 창을 띄우는 GUI·백그라운드).
- `mode = url`: 정적 URL → 브라우저로 열기.
- `mode = url-from-log`: 로그 줄을 `logPattern`(기본 정규식 제공)으로 검사 → 첫 매칭 URL을 열기 대상으로 확정.
- `mode = path`: 파일/폴더 경로 → OS 기본 앱으로 열기.
- `autoOpenOnStart: true`면 대상 확정 시 한 번 자동으로 엶(기본 off).

### 6.4 git 연동 (옵션)
- 프로그램 추가 시 repoUrl + 대상 폴더 → `git clone`(진행 로그 표시). branch 선택 가능.
- `autoPullOnStart`면 프로세스 시작 전 `git pull`.
- PATH의 `git` 사용. 없으면 감지해서 안내.

### 6.5 트레이 / 종료
- 창 닫기 → 트레이로 최소화(프로그램 계속 실행).
- 트레이 메뉴: 창 열기 · 실행 중 개수 · 종료.
- 명시적 "종료" → 실행 중인 게 있으면 확인 후 모두 정리하고 종료(재연결은 안 함).

## 7. UI / 화면 (React)

- **메인 창**: 프로그램 카드 목록. 각 카드 = 이름 · 상태 배지 · on/off 토글 ·
  "열기" 버튼(`open.mode≠none` & 대상 확정 시만) · "로그" 펼치기 · 편집/삭제.
- **추가/편집 폼**: 이름, 작업 폴더 선택, (옵션) git 섹션, 프로세스 목록(여러 개),
  "열기" 섹션(모드 드롭다운 + 조건부 필드 + 자동열기 토글).
- **로그 뷰어**: 프로그램별, 프로세스 탭/병합, tail, 지우기/복사.
- **설정**: 로그 버퍼 크기, 파일 저장 on/off, 기본 로그 정규식, 가져오기/내보내기.
- **트레이**: 아이콘 + 메뉴.

## 8. 코드 구조 · 품질 전략

코드 품질을 구현 단계에 맡기지 않고 스펙에 명시해 강제한다.

### 8.1 폴더 구조 — 경계가 곧 규칙
```
src/
  shared/        ← 단일 진실원: 타입(Program, Process) + IPC 계약(채널·요청/응답 타입)
  main/
    core/        ← 순수 로직(ProcessManager, LogStore, OpenResolver, Store, GitService), electron 의존 0
    ipc/         ← core ↔ renderer 연결하는 얇은 핸들러
    main.ts, tray.ts
  preload/       ← 타입 있는 화이트리스트 브리지(window.api.*)
  renderer/
    features/    ← programs / logs / settings (기능별 컴포넌트+훅+스토어 격리)
    components/  ← 공용 dumb UI(Button, Badge, Toggle, Modal) = 디자인 시스템
    stores/      ← 상태(zustand)
    lib/         ← ipc 클라이언트 래퍼, 포매터
```

### 8.2 IPC 타입 계약
- `shared/`에 채널 목록과 요청/응답 타입을 한 곳에 정의.
- preload는 그 타입대로 `window.api`를 노출, main은 같은 타입으로 핸들러 등록.
- → main과 renderer가 어긋나지 않음. "개판" 방지의 핵심 지렛대.

### 8.3 UI 규율
- 상태관리 = Zustand. 도메인별 스토어: `programs` / `runtime(상태·로그)` / `settings`.
  Context 떡칠·prop drilling 금지.
- 로그는 고빈도 → 링버퍼 + 배치 업데이트로 리렌더 폭주 방지.
- 컴포넌트는 작고 단일 책임. presentational 컴포넌트는 props만 받고 IPC 직접 호출 금지(데이터는 훅/스토어로).
  파일 1개 = 컴포넌트 1개.
- 스타일링: Tailwind + shadcn/ui. 공용 컴포넌트는 `components/`에 모아 디자인 시스템화.

### 8.4 강제 가드레일 (lint로 강제)
- TypeScript `strict: true`.
- ESLint import 경계 규칙: renderer는 `main/` 직접 import 금지 → 반드시 `shared/`+IPC 경유.
- 파일/함수 크기 상한(예: 파일 ~200줄) lint 강제 → 비대해지면 쪼개게 함.
- husky + lint-staged 프리커밋 훅: typecheck + lint + format 통과해야 커밋.
- 커밋 메시지는 **Conventional Commits**(`feat:`/`fix:`/`chore:` …) — release-please 자동 버전 산정의 전제.
- `CONVENTIONS.md`에 위 규칙 명문화.

## 9. 패키징 / 배포

- electron-builder로 빌드.
- 타깃: macOS `.dmg`, Windows NSIS `.exe` 설치기, Linux `.AppImage` + `.deb`.
- 코드 서명·공증, 앱 내 자동 업데이트는 v1 범위 밖(미서명 앱은 mac/win에서 경고 → 추후 추가).

## 10. CI/CD (GitHub Actions)

전 과정 GitHub Actions에서 수행. 흐름: **CI 테스트 → (의도적 릴리즈 시) CD 빌드/배포**.

```
[CI]   PR/푸시마다     → lint + typecheck + 테스트 (3 OS 매트릭스) → 통과해야 머지(branch protection)
[REL]  main 머지마다   → release-please가 "Release PR"에 버전 bump + CHANGELOG 누적
       Release PR 머지 → vX.Y.Z 태그 + GitHub Release 생성
[CD]   태그/릴리즈 시  → electron-builder로 mac/win/linux 빌드 → 설치 파일을 해당 GitHub Release에 업로드
```

### 10.1 CI 워크플로 (`ci.yml`)
- 트리거: 모든 PR + main 푸시.
- 잡: 3 OS 매트릭스(ubuntu/macos/windows)에서 `install → lint → typecheck → test`.
- branch protection으로 CI 통과를 머지 필수 조건으로 설정.

### 10.2 릴리즈 워크플로 (`release-please.yml`)
- 트리거: main 푸시.
- release-please action이 Conventional Commits를 읽어 **Release PR**을 생성/갱신
  (다음 semver 버전 + CHANGELOG 누적). 평소 머지는 릴리즈되지 않음.
- 개발자가 준비됐을 때 그 Release PR을 머지 → release-please가 `vX.Y.Z` 태그 + GitHub Release 생성.

### 10.3 CD 빌드 워크플로 (`build-release.yml`)
- 트리거: release-please가 만든 태그/릴리즈(`release` published 또는 `v*` 태그 푸시).
- 3 OS 매트릭스에서 electron-builder로 설치 파일 빌드.
- 산출물(.dmg/.exe/.AppImage/.deb)을 해당 GitHub Release에 업로드.

## 11. 테스트 전략

- **단위**: `ProcessManager`(child_process 모킹), `OpenResolver`(정규식 매칭),
  `Store`(JSON 입출력), `GitService`(모킹).
- **통합**: 실제 더미 스크립트(예: URL 출력 후 대기하는 node 스크립트)로
  시작/종료/트리킬/로그 캡처/url-from-log 탐지 검증.
- **E2E(후순위)**: Playwright for Electron.
- **CI**: 위 테스트를 3 OS 매트릭스로 실행.
- 러너: **Vitest**(단위·통합) — TS/ESM 지원이 좋고 Electron 프로젝트와 궁합이 좋음.

## 12. 기술 스택 요약

| 영역 | 선택 |
|------|------|
| 셸 | Electron |
| 언어 | TypeScript (main + renderer + shared) |
| UI | React + Tailwind + shadcn/ui |
| 상태관리 | Zustand |
| 프로세스 트리 종료 | detached 그룹 kill(POSIX) / taskkill·tree-kill(Windows) |
| 패키징 | electron-builder |
| 테스트 | Vitest(단위·통합) + Playwright(E2E, 후순위) |
| 품질 | TypeScript strict, ESLint(경계 규칙), Prettier, husky + lint-staged, Conventional Commits |
| CI/CD | GitHub Actions: ci.yml + release-please.yml + build-release.yml |

## 13. 향후 항목 (범위 밖)

자동 재시작·헬스체크·리소스 그래프 / 프로세스 간 의존성 / 개별 프로세스 독립 on/off /
앱 내 자동 업데이트·코드 서명 / 원격·멀티유저 / 로그 검색.

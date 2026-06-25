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

## 사용법 (프로그램 등록)

하나의 **프로그램**은 이름 + 작업 폴더 + **프로세스 여러 개**로 이루어지고, 카드의 토글로 한 번에 시작/정지합니다(시작은 `시작 순서`대로, 정지는 역순).

### 프로세스 필드

| 필드      | 설명                                                                 |
| --------- | -------------------------------------------------------------------- |
| 이름      | 라벨 (예: `backend`, `frontend`) — "열기" 대상 선택에도 쓰임         |
| 명령      | 실행 파일 (예: `python`, `npm`, `node`)                              |
| 인자      | 공백으로 구분 (예: `-m uvicorn main:app --reload`)                   |
| 시작 순서 | 낮은 값부터 시작                                                     |
| 작업 폴더 | 비우면 프로그램 작업 폴더 사용. **프로세스마다 다른 폴더 지정 가능** |

> 프론트엔드·백엔드 폴더가 다를 때: 한 프로그램에 프로세스 2개를 넣고 각각의 `작업 폴더`를 따로 지정하면 됩니다.

**예시 — FastAPI + React**

| 이름     | 명령     | 인자                           | 작업 폴더           | 순서 |
| -------- | -------- | ------------------------------ | ------------------- | ---- |
| backend  | `python` | `-m uvicorn main:app --reload` | `/path/to/backend`  | 0    |
| frontend | `npm`    | `run dev`                      | `/path/to/frontend` | 1    |

### "열기" 동작

각 프로그램에 선택적 "열기" 대상을 둘 수 있습니다:

- **없음** — 자체 창을 띄우는 GUI/백그라운드
- **정적 URL** — 고정 주소를 브라우저로
- **로그에서 URL 자동탐지** — 프로세스 로그에서 URL을 찾아 "열기" 버튼/자동 열기에 사용
  - **URL을 찾을 프로세스**를 고르면 그 프로세스 로그에서만 탐지 → 백엔드 URL이 잘못 잡히는 걸 방지
  - 정규식은 비우면 기본값 `https?://[^\s]+` 사용 (대부분 그대로 잡힘). 특정 패턴이 필요하면 예: `https?://localhost:\d+`
- **파일/폴더 경로** — OS 기본 앱으로 열기

`시작 시 자동 열기`를 켜면 대상이 확정되는 즉시 자동으로 엽니다.

### 로그

- 실시간 스트리밍, 터미널 **ANSI 색상 코드는 자동 제거**되어 깔끔하게 표시
- 로그 영역 **오른쪽 아래 모서리를 드래그**해 높이 조절
- 설정에서 **로그 파일 저장**을 켜면 `userData/logs/<programId>.log`에 기록

### 트레이

창을 닫으면 트레이로 최소화되어 프로그램은 계속 실행됩니다. 트레이 메뉴의 **종료**를 누르면 실행 중인 프로세스를 모두 정리하고 앱을 끝냅니다.

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

## 릴리즈 (수동)

GitHub에 Release를 발행하면 `build-release` 워크플로가 3 OS 설치 파일을 빌드해 릴리즈에 첨부합니다.

```bash
# 1) 버전 올리기 (package.json 버전 + 커밋 + vX.Y.Z 태그 생성)
npm version patch      # 또는 minor / major
# 2) 푸시 (태그 포함)
git push --follow-tags
# 3) 릴리즈 발행 → build-release 트리거 → 3 OS 설치파일 빌드/첨부
gh release create "v$(node -p "require('./package.json').version")" --generate-notes
```

> 설치파일 이름은 `package.json` 버전을 따르므로 릴리즈 전 `npm version`으로 버전을 올리세요.
> 빌드는 GitHub Actions(3 OS 러너)에서 수행되므로 로컬에서 mac/win/linux를 모두 만들 필요는 없습니다
> (로컬 검증은 현재 OS만, 예: macOS는 `npm run build:mac`).

## 최초 1회 설정 (GitHub 연동)

CI/CD 워크플로는 원격 저장소가 있어야 동작합니다.

```bash
gh repo create tool_launcher --private --source=. --remote=origin
git push -u origin main
```

- `package.json`의 `repository.url`과 `electron-builder.yml`의 `publish`가 실제 저장소와 일치하는지 확인.
- `main`에 branch protection을 걸어 CI 통과를 머지 필수 조건으로 설정 권장.

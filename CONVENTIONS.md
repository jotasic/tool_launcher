# Tool Launcher 개발 컨벤션

## 디렉토리 구조 및 레이어 경계

| 레이어       | 경로                             | 역할                                                                     |
| ------------ | -------------------------------- | ------------------------------------------------------------------------ |
| **shared**   | `src/shared/`                    | 싱글 소스 오브 트루스. 타입, 스키마, 상수만 포함. Electron/Node 미사용.  |
| **core**     | `src/main/core/`                 | 순수 비즈니스 로직. Electron API 없음. 의존성 주입 방식으로 테스트 가능. |
| **ipc**      | `src/main/ipc/`, `src/main/*.ts` | Electron IPC 핸들러 등록 및 글루 코드.                                   |
| **preload**  | `src/preload/`                   | 타입된 화이트리스트 브리지. `contextBridge.exposeInMainWorld`만 허용.    |
| **renderer** | `src/renderer/`                  | React UI. `src/main` 직접 임포트 금지.                                   |

### ESLint 강제 경계

- `renderer` → `main` 임포트 금지
- `core` → Electron 모듈 임포트 금지
- 파일 250줄 초과 시 경고 (ESLint `max-lines` 규칙)

## UI 규칙

- **상태 관리**: Zustand 도메인 스토어 (`src/renderer/src/store/`)
- **컴포넌트**: Presentational 컴포넌트는 props만 사용, 직접 IPC 호출 금지
- **파일 단위**: 파일당 컴포넌트 하나 (단, subcomponent 허용)
- **스타일**: Tailwind CSS + shadcn/ui 컴포넌트 (`src/renderer/src/components/ui/`)

## 커밋 규칙

[Conventional Commits](https://www.conventionalcommits.org/) 형식 강제 (`commitlint`):

```
<type>(<scope>): <subject>
```

허용 타입: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

예시:

- `feat(ipc): add program-launch handler`
- `fix(renderer): correct store hydration on startup`
- `chore: add husky, lint-staged, commitlint`

> `release-please`가 커밋 메시지로 버전과 CHANGELOG를 자동 생성합니다.

## Git 훅 (Husky)

| 훅           | 실행 내용                                                     |
| ------------ | ------------------------------------------------------------- |
| `pre-commit` | `lint-staged` (ESLint --fix + Prettier) → `npm run typecheck` |
| `commit-msg` | `commitlint` — Conventional Commits 형식 검증                 |

## 테스트 전략

- **유닛 테스트**: `src/main/core/` 로직은 Vitest로 테스트. 의존성 주입으로 Electron 없이 실행.
- **통합 테스트**: 실제 프로세스/네트워크가 필요한 경우에만 통합 테스트로 분리.
- `npm test` = `vitest run` (CI에서 항상 실행됨)

## CI 참고

`npm ci` 실행 시 `prepare` 스크립트가 자동으로 husky를 설치합니다.

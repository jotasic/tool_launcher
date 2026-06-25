# Tool Launcher M2 — 열기 모델 · 폼 · git · 트레이 · 설정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** M1 위에 "열기" 동작(정적/로그탐지/경로), 프로그램 추가·편집 폼, git clone/pull, 트레이 최소화·종료, 설정·가져오기/내보내기를 더해 기능 완성 단계로 만든다.

**Architecture:** "열기" 해석은 순수 함수(OpenResolver)로 만들고 ProcessManager가 호출해 `resolvedOpenTarget`을 채운다. GitService도 git 실행 러너를 주입받는 순수 로직. UI는 shadcn/ui 컴포넌트로 폼/모달을 구성. 트레이 동작은 main에서 처리.

**Tech Stack:** (M1에 추가) shadcn/ui, Radix(shadcn 의존), react-hook-form(폼), electron Tray/Menu.

## Global Constraints

- M1의 Global Constraints 전부 유효(strict TS, 코어 electron 의존 0, IPC 경계, Conventional Commits, 트리킬).
- "열기" 모드: `none` / `url` / `url-from-log`(로그에서 정규식으로 URL 탐지) / `path`(OS 기본 앱). `autoOpenOnStart` 기본 false.
- 종료 동작: 창 닫기는 트레이로 최소화(프로그램 유지), 트레이 "종료"는 실행 중이면 확인 후 모두 정리하고 종료.
- 코어 신규 로직(OpenResolver, GitService)은 단위 테스트 필수.

---

### Task 1: OpenResolver (순수 함수)

**Files:**

- Create: `src/main/core/open-resolver.ts`
- Test: `src/main/core/open-resolver.test.ts`

**Interfaces:**

- Consumes: `OpenSpec` (shared/types).
- Produces:
  - `resolveStaticOpen(open: OpenSpec | undefined): string | undefined` — `url`/`path`는 value 반환, 그 외 undefined.
  - `matchUrlFromLog(text: string, pattern: string): string | undefined` — 정규식 첫 매칭 반환, 없으면 undefined, 잘못된 정규식이면 undefined.

- [ ] **Step 1: 실패 테스트 작성**

Create `src/main/core/open-resolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveStaticOpen, matchUrlFromLog } from './open-resolver'

describe('resolveStaticOpen', () => {
  it('returns value for url mode', () => {
    expect(resolveStaticOpen({ mode: 'url', value: 'http://x', autoOpenOnStart: false })).toBe(
      'http://x'
    )
  })
  it('returns value for path mode', () => {
    expect(resolveStaticOpen({ mode: 'path', value: '/tmp/a', autoOpenOnStart: false })).toBe(
      '/tmp/a'
    )
  })
  it('returns undefined for none and url-from-log', () => {
    expect(resolveStaticOpen({ mode: 'none', autoOpenOnStart: false })).toBeUndefined()
    expect(
      resolveStaticOpen({ mode: 'url-from-log', logPattern: 'x', autoOpenOnStart: false })
    ).toBeUndefined()
  })
  it('returns undefined when open is undefined', () => {
    expect(resolveStaticOpen(undefined)).toBeUndefined()
  })
})

describe('matchUrlFromLog', () => {
  it('extracts first url-like match', () => {
    expect(
      matchUrlFromLog('Running on http://127.0.0.1:8501 (Press Ctrl+C)', 'https?://[^\\s]+')
    ).toBe('http://127.0.0.1:8501')
  })
  it('returns undefined when no match', () => {
    expect(matchUrlFromLog('no url here', 'https?://[^\\s]+')).toBeUndefined()
  })
  it('returns undefined for invalid regex', () => {
    expect(matchUrlFromLog('http://x', '(')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/main/core/open-resolver.test.ts`
Expected: FAIL ("Cannot find module './open-resolver'").

- [ ] **Step 3: 구현**

Create `src/main/core/open-resolver.ts`:

```ts
import type { OpenSpec } from '../../shared/types'

export function resolveStaticOpen(open: OpenSpec | undefined): string | undefined {
  if (!open) return undefined
  if (open.mode === 'url' || open.mode === 'path') {
    return open.value && open.value.length > 0 ? open.value : undefined
  }
  return undefined
}

export function matchUrlFromLog(text: string, pattern: string): string | undefined {
  try {
    const re = new RegExp(pattern)
    const m = re.exec(text)
    return m ? m[0] : undefined
  } catch {
    return undefined
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/main/core/open-resolver.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/core/open-resolver.ts src/main/core/open-resolver.test.ts
git commit -m "feat: add OpenResolver for static and log-derived open targets"
```

---

### Task 2: ProcessManager에 "열기" 해석 통합

**Files:**

- Modify: `src/main/core/process-manager.ts`
- Modify: `src/main/core/process-manager.test.ts`

**Interfaces:**

- Consumes: `resolveStaticOpen`, `matchUrlFromLog` (Task 1).
- Produces (추가):
  - `start()`가 시작 시 `resolvedOpenTarget`을 정적 모드면 즉시 설정.
  - `url-from-log` 모드: 로그 라인마다 `program.open.logPattern`(없으면 기본값 주입)으로 검사, 첫 매칭 시 `resolvedOpenTarget` 설정 + runtime 변경 emit.
  - `onOpenRequested(cb: (programId: string, target: string) => void): () => void` — `autoOpenOnStart`가 true이고 target이 확정되면 1회 호출.
  - 생성자 opts에 `defaultLogPattern: string` 추가(기본 `'https?://[^\\s]+'`).

- [ ] **Step 1: 실패 테스트 추가**

`src/main/core/process-manager.test.ts`에 추가:

```ts
describe('ProcessManager open resolution', () => {
  it('sets resolvedOpenTarget for static url on start', async () => {
    const { deps } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(
      prog({ open: { mode: 'url', value: 'http://localhost:3000', autoOpenOnStart: false } })
    )
    expect(pm.getRuntime('a').resolvedOpenTarget).toBe('http://localhost:3000')
  })

  it('detects url from logs in url-from-log mode', async () => {
    const { deps, children } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(prog({ open: { mode: 'url-from-log', autoOpenOnStart: false } }))
    children[0].emitStdout('Running on http://127.0.0.1:8501\n')
    expect(pm.getRuntime('a').resolvedOpenTarget).toBe('http://127.0.0.1:8501')
  })

  it('fires onOpenRequested once when autoOpenOnStart and target resolves', async () => {
    const { deps, children } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    const opened: string[] = []
    pm.onOpenRequested((_id, target) => opened.push(target))
    await pm.start(prog({ open: { mode: 'url-from-log', autoOpenOnStart: true } }))
    children[0].emitStdout('http://127.0.0.1:8501\nhttp://127.0.0.1:9999\n')
    expect(opened).toEqual(['http://127.0.0.1:8501'])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/main/core/process-manager.test.ts`
Expected: FAIL (resolvedOpenTarget undefined / onOpenRequested 없음).

- [ ] **Step 3: 구현 수정**

`process-manager.ts` 상단 import 추가:

```ts
import { resolveStaticOpen, matchUrlFromLog } from './open-resolver'
import type { OpenSpec } from '../../shared/types'
```

`ProgramState`에 필드 추가:

```ts
interface ProgramState {
  status: ProgramStatus
  error?: string
  resolvedOpenTarget?: string
  procs: RunningProc[]
  open?: OpenSpec
  openDone?: boolean
}
```

생성자 opts 확장:

```ts
  private stopGraceMs: number
  private defaultLogPattern: string
  constructor(
    private logs: LogStore,
    private deps: ProcessDeps,
    opts?: { stopGraceMs?: number; defaultLogPattern?: string },
  ) {
    this.stopGraceMs = opts?.stopGraceMs ?? 5000
    this.defaultLogPattern = opts?.defaultLogPattern ?? 'https?://[^\\s]+'
  }
```

open 콜백 추가:

```ts
  private openListeners = new Set<(programId: string, target: string) => void>()
  onOpenRequested(cb: (programId: string, target: string) => void): () => void {
    this.openListeners.add(cb)
    return () => this.openListeners.delete(cb)
  }
  private requestOpen(programId: string, target: string): void {
    const st = this.states.get(programId)
    if (!st || st.openDone) return
    st.openDone = true
    for (const cb of this.openListeners) cb(programId, target)
  }
```

`start()`에서 초기 상태 설정 시 open 보관 + 정적 해석:

`this.states.set(program.id, { status: 'starting', procs: [] })` 를 다음으로 교체:

```ts
const staticTarget = resolveStaticOpen(program.open)
this.states.set(program.id, {
  status: 'starting',
  procs: [],
  open: program.open,
  resolvedOpenTarget: staticTarget
})
this.setStatus(program.id, {})
if (staticTarget && program.open?.autoOpenOnStart) {
  this.requestOpen(program.id, staticTarget)
}
```

`pipe()`의 라인 처리에서 url-from-log 검사 추가. `this.log(...)` 호출 뒤에 다음을 넣는다(라인 단위 처리 안에서):

```ts
this.maybeDetectUrl(programId, l)
```

그리고 메서드 추가:

```ts
  private maybeDetectUrl(programId: string, line: string): void {
    const st = this.states.get(programId)
    if (!st || st.open?.mode !== 'url-from-log' || st.resolvedOpenTarget) return
    const pattern = st.open.logPattern || this.defaultLogPattern
    const found = matchUrlFromLog(line, pattern)
    if (found) {
      this.setStatus(programId, { resolvedOpenTarget: found })
      if (st.open.autoOpenOnStart) this.requestOpen(programId, found)
    }
  }
```

> `pipe`는 현재 `(programId, spec, child)`를 받는다. 라인 루프 안에서 `this.log(programId, spec.name, stream, l)` 다음 줄에 `this.maybeDetectUrl(programId, l)`를 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/main/core/process-manager.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/core/process-manager.ts src/main/core/process-manager.test.ts
git commit -m "feat: resolve open target (static + url-from-log) and auto-open hook"
```

---

### Task 3: IPC 계약에 git 채널 추가 + 자동 열기 연결

**Files:**

- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/register-ipc.ts`

**Interfaces:**

- Produces (계약 추가):
  - invoke `'git:clone': (req: { repoUrl: string; branch?: string; targetDir: string }) => Promise<void>`
  - event `'git:progress': { text: string }`
- register-ipc: `processes.onOpenRequested`를 구독해 `shell.openExternal`(url) 또는 `shell.openPath`(경로) 호출.

- [ ] **Step 1: 계약 확장**

`src/shared/ipc.ts`의 `IpcApi`에 추가:

```ts
  'git:clone': (req: { repoUrl: string; branch?: string; targetDir: string }) => Promise<void>
```

`IpcEvents`에 추가:

```ts
  'git:progress': { text: string }
```

`INVOKE_CHANNELS`에 `'git:clone'`, `EVENT_CHANNELS`에 `'git:progress'` 추가.

- [ ] **Step 2: 자동 열기 연결**

`register-ipc.ts`의 이벤트 구독부에 추가(파일 끝 `logs.subscribe` 근처):

```ts
processes.onOpenRequested(async (_id, target) => {
  if (/^https?:\/\//.test(target)) await shell.openExternal(target)
  else await shell.openPath(target)
})
```

또한 기존 `programs:open` 핸들러를 url/경로 구분하도록 교체:

```ts
ipcMain.handle('programs:open', async (_e, id: string) => {
  const target = processes.getRuntime(id).resolvedOpenTarget
  if (!target) return
  if (/^https?:\/\//.test(target)) await shell.openExternal(target)
  else await shell.openPath(target)
})
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc.ts src/main/ipc/register-ipc.ts
git commit -m "feat: add git IPC channel and wire auto-open via shell"
```

---

### Task 4: GitService (clone / pull)

**Files:**

- Create: `src/main/core/git-service.ts`
- Test: `src/main/core/git-service.test.ts`

**Interfaces:**

- Produces: `class GitService`
  - 주입식: `constructor(deps: { run: (args: string[], opts: { cwd?: string }, onLine: (line: string) => void) => Promise<{ code: number }> })`
  - `clone(req: { repoUrl: string; branch?: string; targetDir: string }, onProgress: (line: string) => void): Promise<void>` — 실패(code≠0) 시 throw.
  - `pull(dir: string, onProgress: (line: string) => void): Promise<void>`
- 실제 러너 어댑터: `createGitRunner()` (child_process.spawn('git', ...)), `real-deps.ts`에 추가하거나 별도. 여기서는 git-service.ts 내 `createGitRunner` 제공.

- [ ] **Step 1: 실패 테스트 작성**

Create `src/main/core/git-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { GitService } from './git-service'

describe('GitService', () => {
  it('runs clone with branch and targetDir', async () => {
    const calls: string[][] = []
    const svc = new GitService({
      run: async (args) => {
        calls.push(args)
        return { code: 0 }
      }
    })
    await svc.clone({ repoUrl: 'https://x/y.git', branch: 'dev', targetDir: '/tmp/y' }, () => {})
    expect(calls[0]).toEqual(['clone', '--branch', 'dev', 'https://x/y.git', '/tmp/y'])
  })

  it('omits --branch when not given', async () => {
    const calls: string[][] = []
    const svc = new GitService({
      run: async (args) => {
        calls.push(args)
        return { code: 0 }
      }
    })
    await svc.clone({ repoUrl: 'https://x/y.git', targetDir: '/tmp/y' }, () => {})
    expect(calls[0]).toEqual(['clone', 'https://x/y.git', '/tmp/y'])
  })

  it('throws on non-zero exit', async () => {
    const svc = new GitService({ run: async () => ({ code: 128 }) })
    await expect(svc.clone({ repoUrl: 'bad', targetDir: '/tmp/y' }, () => {})).rejects.toThrow()
  })

  it('runs pull in the given dir', async () => {
    const seen: { args: string[]; cwd?: string }[] = []
    const svc = new GitService({
      run: async (args, opts) => {
        seen.push({ args, cwd: opts.cwd })
        return { code: 0 }
      }
    })
    await svc.pull('/tmp/y', () => {})
    expect(seen[0]).toEqual({ args: ['pull'], cwd: '/tmp/y' })
  })

  it('forwards progress lines', async () => {
    const lines: string[] = []
    const svc = new GitService({
      run: async (_a, _o, onLine) => {
        onLine('Cloning...')
        return { code: 0 }
      }
    })
    await svc.clone({ repoUrl: 'x', targetDir: '/tmp/y' }, (l) => lines.push(l))
    expect(lines).toContain('Cloning...')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/main/core/git-service.test.ts`
Expected: FAIL ("Cannot find module './git-service'").

- [ ] **Step 3: 구현**

Create `src/main/core/git-service.ts`:

```ts
import { spawn } from 'node:child_process'

export interface GitRunner {
  run: (
    args: string[],
    opts: { cwd?: string },
    onLine: (line: string) => void
  ) => Promise<{ code: number }>
}

export class GitService {
  constructor(private deps: GitRunner) {}

  async clone(
    req: { repoUrl: string; branch?: string; targetDir: string },
    onProgress: (line: string) => void
  ): Promise<void> {
    const args = ['clone']
    if (req.branch) args.push('--branch', req.branch)
    args.push(req.repoUrl, req.targetDir)
    const { code } = await this.deps.run(args, {}, onProgress)
    if (code !== 0) throw new Error(`git clone failed (exit ${code})`)
  }

  async pull(dir: string, onProgress: (line: string) => void): Promise<void> {
    const { code } = await this.deps.run(['pull'], { cwd: dir }, onProgress)
    if (code !== 0) throw new Error(`git pull failed (exit ${code})`)
  }
}

export function createGitRunner(): GitRunner {
  return {
    run: (args, opts, onLine) =>
      new Promise((resolve) => {
        const child = spawn('git', args, { cwd: opts.cwd })
        const handle = (chunk: Buffer) => {
          for (const l of chunk.toString().split('\n')) if (l.length) onLine(l)
        }
        child.stdout?.on('data', handle)
        child.stderr?.on('data', handle) // git은 진행상황을 stderr로 출력
        child.on('error', (err) => {
          onLine(String(err))
          resolve({ code: 1 })
        })
        child.on('exit', (code) => resolve({ code: code ?? 1 }))
      })
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/main/core/git-service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: git IPC 핸들러 + AppContext 연결**

`src/main/app-context.ts`에 GitService 추가:

```ts
import { GitService, createGitRunner } from './core/git-service'
```

`AppContext` 인터페이스에 `git: GitService` 추가, `createAppContext` 반환에 `git: new GitService(createGitRunner())` 추가.

`register-ipc.ts`에 핸들러 추가(`const { store, processes, logs } = ctx` 를 `const { store, processes, logs, git } = ctx`로):

```ts
ipcMain.handle('git:clone', async (_e, req) => {
  await git.clone(req, (line) => {
    if (!win.isDestroyed()) win.webContents.send('git:progress', { text: line })
  })
})
```

- [ ] **Step 6: 타입체크 + 테스트**

Run: `npx tsc --noEmit -p tsconfig.node.json && npm test`
Expected: 통과.

- [ ] **Step 7: Commit**

```bash
git add src/main/core/git-service.ts src/main/core/git-service.test.ts src/main/app-context.ts src/main/ipc/register-ipc.ts
git commit -m "feat: add GitService with clone/pull and IPC progress streaming"
```

---

### Task 5: shadcn/ui 설치 및 기본 컴포넌트

**Files:**

- Modify: `tsconfig.json` (path alias), `electron.vite.config.ts` (resolve alias)
- Create: `components.json`, `src/renderer/lib/utils.ts`
- Create: `src/renderer/components/ui/button.tsx`, `input.tsx`, `dialog.tsx`, `select.tsx`, `label.tsx`, `switch.tsx`

**Interfaces:**

- Produces: shadcn 컴포넌트(`Button`, `Input`, `Dialog`, `Select`, `Label`, `Switch`)를 `@/components/ui/*`에서 import 가능.

- [ ] **Step 1: path alias 설정**

`tsconfig.json`(또는 web용 tsconfig)의 compilerOptions에:

```json
"baseUrl": ".",
"paths": { "@/*": ["src/renderer/*"] }
```

`electron.vite.config.ts`의 renderer 설정 `resolve.alias`에 추가:

```ts
import { resolve } from 'path'
// renderer: { resolve: { alias: { '@': resolve('src/renderer') } }, ... }
```

- [ ] **Step 2: shadcn 초기화**

```bash
npx shadcn@latest init
```

프롬프트: style=default, base color=slate, CSS variables=yes. `components.json`이 생성되고 `src/renderer/lib/utils.ts`(cn 헬퍼)와 Tailwind 설정이 갱신된다. (경로가 다르면 `components.json`의 `aliases`/`tailwind.css`를 renderer 경로로 수정)

- [ ] **Step 3: 컴포넌트 추가**

```bash
npx shadcn@latest add button input dialog select label switch
```

- [ ] **Step 4: 빌드 확인**

`App.tsx`에 임시로 `import { Button } from '@/components/ui/button'` 후 `<Button>OK</Button>` 렌더 → `npm run dev`로 표시 확인 후 되돌림.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: set up shadcn/ui components and path alias"
```

---

### Task 6: 프로그램 추가/편집 폼

**Files:**

- Create: `src/renderer/features/programs/ProgramForm.tsx`
- Create: `src/renderer/features/programs/ProcessFields.tsx`
- Create: `src/renderer/features/programs/OpenFields.tsx`
- Modify: `src/renderer/features/programs/ProgramList.tsx` (추가 버튼)
- Modify: `src/renderer/features/programs/ProgramRow.tsx` (편집 버튼)
- Modify: `src/renderer/stores/programs.ts` (create/update/remove 액션)

**Interfaces:**

- Consumes: shadcn 컴포넌트, `ipc`, `dialog:pickDirectory`.
- Produces: 모달 폼으로 Program 생성/수정. 프로세스 여러 개 추가/삭제, open 모드별 조건부 필드, 작업 폴더 선택 버튼.

- [ ] **Step 1: 스토어에 mutation 액션 추가**

`src/renderer/stores/programs.ts`의 인터페이스/구현에 추가:

```ts
create: (p: Omit<Program, 'id'>) => Promise<void>
update: (p: Program) => Promise<void>
remove: (id: string) => Promise<void>
```

구현(set 안에서 load 재호출로 단순화):

```ts
  create: async (p) => { await ipc.invoke('programs:create', p); await get().load() },
  update: async (p) => { await ipc.invoke('programs:update', p); await get().load() },
  remove: async (id) => { await ipc.invoke('programs:delete', id); await get().load() },
```

> `create<ProgramsState>((set, get) => ...)`로 `get` 추가.

- [ ] **Step 2: OpenFields 컴포넌트**

Create `src/renderer/features/programs/OpenFields.tsx`:

```tsx
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { OpenSpec, OpenMode } from '../../../shared/types'

export function OpenFields({
  value,
  onChange
}: {
  value: OpenSpec
  onChange: (v: OpenSpec) => void
}) {
  return (
    <div className="space-y-2 rounded border p-3">
      <Label>열기 동작</Label>
      <select
        className="w-full rounded border p-2"
        value={value.mode}
        onChange={(e) => onChange({ ...value, mode: e.target.value as OpenMode })}
      >
        <option value="none">없음 (자체 창/백그라운드)</option>
        <option value="url">정적 URL</option>
        <option value="url-from-log">로그에서 URL 자동탐지</option>
        <option value="path">파일/폴더 경로</option>
      </select>

      {(value.mode === 'url' || value.mode === 'path') && (
        <Input
          placeholder={value.mode === 'url' ? 'http://localhost:3000' : '/path/to/file'}
          value={value.value ?? ''}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
      )}
      {value.mode === 'url-from-log' && (
        <Input
          placeholder="정규식 (비우면 기본값 사용)"
          value={value.logPattern ?? ''}
          onChange={(e) => onChange({ ...value, logPattern: e.target.value })}
        />
      )}
      {value.mode !== 'none' && (
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={value.autoOpenOnStart}
            onCheckedChange={(c) => onChange({ ...value, autoOpenOnStart: c })}
          />
          시작 시 자동 열기
        </label>
      )}
    </div>
  )
}
```

- [ ] **Step 3: ProcessFields 컴포넌트**

Create `src/renderer/features/programs/ProcessFields.tsx`:

```tsx
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ProcessSpec } from '../../../shared/types'

export function ProcessFields({
  value,
  onChange
}: {
  value: ProcessSpec[]
  onChange: (v: ProcessSpec[]) => void
}) {
  const update = (i: number, patch: Partial<ProcessSpec>) =>
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const add = () =>
    onChange([...value, { name: `proc${value.length + 1}`, command: '', order: value.length }])
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <Input
            className="col-span-2"
            placeholder="이름"
            value={p.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Input
            className="col-span-5"
            placeholder="명령 (예: python)"
            value={p.command}
            onChange={(e) => update(i, { command: e.target.value })}
          />
          <Input
            className="col-span-3"
            placeholder="인자 (공백구분)"
            value={(p.args ?? []).join(' ')}
            onChange={(e) => update(i, { args: e.target.value.split(' ').filter(Boolean) })}
          />
          <Input
            className="col-span-1"
            type="number"
            value={p.order}
            onChange={(e) => update(i, { order: Number(e.target.value) })}
          />
          <Button className="col-span-1" variant="ghost" onClick={() => remove(i)}>
            ✕
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={add}>
        + 프로세스 추가
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: ProgramForm (모달)**

Create `src/renderer/features/programs/ProgramForm.tsx`:

```tsx
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProcessFields } from './ProcessFields'
import { OpenFields } from './OpenFields'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'
import type { Program, OpenSpec } from '../../../shared/types'

const emptyOpen: OpenSpec = { mode: 'none', autoOpenOnStart: false }

export function ProgramForm({
  existing,
  trigger
}: {
  existing?: Program
  trigger: React.ReactNode
}) {
  const create = useProgramsStore((s) => s.create)
  const update = useProgramsStore((s) => s.update)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? '')
  const [workingDir, setWorkingDir] = useState(existing?.workingDir ?? '')
  const [processes, setProcesses] = useState(
    existing?.processes ?? [{ name: 'proc1', command: '', order: 0 }]
  )
  const [openSpec, setOpenSpec] = useState<OpenSpec>(existing?.open ?? emptyOpen)

  const pickDir = async () => {
    const dir = await ipc.invoke('dialog:pickDirectory')
    if (dir) setWorkingDir(dir)
  }

  const submit = async () => {
    const payload = { name, workingDir, processes, open: openSpec }
    if (existing) await update({ ...existing, ...payload })
    else await create(payload)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{existing ? '프로그램 편집' : '프로그램 추가'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>이름</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>작업 폴더</Label>
            <div className="flex gap-2">
              <Input value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} />
              <Button variant="outline" onClick={pickDir}>
                선택
              </Button>
            </div>
          </div>
          <div>
            <Label>프로세스</Label>
            <ProcessFields value={processes} onChange={setProcesses} />
          </div>
          <OpenFields value={openSpec} onChange={setOpenSpec} />
          <Button
            onClick={submit}
            disabled={!name || !workingDir || processes.some((p) => !p.command)}
          >
            저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: 목록/행에 추가·편집·삭제 버튼 연결**

`ProgramList.tsx`에 추가 버튼:

```tsx
import { ProgramForm } from './ProgramForm'
import { Button } from '@/components/ui/button'
// 컴포넌트 상단:
//   <div className="mb-3"><ProgramForm trigger={<Button>+ 프로그램 추가</Button>} /></div>
```

`ProgramRow.tsx`에 편집/삭제:

```tsx
import { ProgramForm } from './ProgramForm'
// 행 버튼들 옆:
//   <ProgramForm existing={program} trigger={<button className="text-sm text-gray-600">편집</button>} />
//   <button className="text-sm text-red-600" onClick={() => useProgramsStore.getState().remove(program.id)}>삭제</button>
```

- [ ] **Step 6: 수동 검증**

Run: `npm run dev`
Expected: "+ 프로그램 추가" → 폼에서 이름/폴더(선택 버튼 동작)/프로세스 입력 → 저장 → 목록 반영 → 시작/정지 동작 → 편집/삭제 동작.

- [ ] **Step 7: 타입체크 + 테스트 + Commit**

```bash
npx tsc --noEmit && npm test
git add src/renderer
git commit -m "feat: add/edit program form with processes, open modes, dir picker"
```

---

### Task 7: 트레이 최소화 + 종료 동작

**Files:**

- Modify: `src/main/main.ts`
- Create: `src/main/tray.ts`
- Create: `resources/tray-icon.png` (16/32px 아이콘; 임시로 단색 PNG 가능)

**Interfaces:**

- Consumes: `AppContext`(실행 중 개수 표시·정리용).
- Produces: `setupTray(win, ctx, onQuit)` — 트레이 아이콘+메뉴(창 열기/실행 중 개수/종료). 창 닫기는 hide. 종료 시 실행 중 프로그램 모두 stop 후 quit.

- [ ] **Step 1: 트레이 모듈**

Create `src/main/tray.ts`:

```ts
import { Tray, Menu, app, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { AppContext } from './app-context'

export function setupTray(win: BrowserWindow, ctx: AppContext): Tray {
  const tray = new Tray(join(__dirname, '../../resources/tray-icon.png'))

  const runningCount = () =>
    ctx.store.listPrograms().filter((p) => {
      const s = ctx.processes.getRuntime(p.id).status
      return s === 'running' || s === 'starting'
    }).length

  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: '창 열기', click: () => win.show() },
      { label: `실행 중: ${runningCount()}개`, enabled: false },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() }
    ])
    tray.setContextMenu(menu)
  }

  rebuild()
  ctx.processes.onRuntimeChange(rebuild)
  tray.on('click', () => win.show())
  return tray
}
```

- [ ] **Step 2: main.ts에 트레이·종료 로직 연결**

`src/main/main.ts` 수정:

```ts
import { setupTray } from './tray'

let isQuitting = false
```

`createWindow` 안에서 IPC 등록 직후:

```ts
setupTray(win, ctx)
win.on('close', (e) => {
  if (!isQuitting) {
    e.preventDefault()
    win?.hide()
  }
})
```

`app.on('window-all-closed', ...)` 교체 + before-quit 정리:

```ts
app.on('window-all-closed', () => {
  /* 트레이 유지: 자동 종료 안 함 */
})

app.on('before-quit', async (e) => {
  if (isQuitting) return
  e.preventDefault()
  isQuitting = true
  const ctx = currentCtx
  if (ctx) {
    for (const p of ctx.store.listPrograms()) {
      const s = ctx.processes.getRuntime(p.id).status
      if (s === 'running' || s === 'starting') await ctx.processes.stop(p.id)
    }
  }
  app.quit()
})
```

`createWindow`에서 `const ctx = createAppContext(...)`를 모듈 스코프 `currentCtx`에 저장:

```ts
let currentCtx: import('./app-context').AppContext | null = null
// createWindow 안:  currentCtx = ctx
```

> 정리 확인 다이얼로그(실행 중일 때)는 선택. 최소 구현은 "실행 중이면 정리 후 종료". 확인창이 필요하면 `before-quit`에서 `dialog.showMessageBoxSync`로 확인 후 진행.

- [ ] **Step 3: 임시 트레이 아이콘 준비**

`resources/tray-icon.png`에 16x16 또는 32x32 PNG 배치. 임시로 어떤 작은 PNG든 가능(추후 M3에서 정식 아이콘 교체).

- [ ] **Step 4: 수동 검증**

Run: `npm run dev`
Expected:

- 프로그램 시작 후 창 닫기(X) → 창이 사라지고 트레이 아이콘 유지, 프로그램은 계속 실행(Activity Monitor 확인).
- 트레이 메뉴 "창 열기" → 다시 보임. "실행 중: N개" 표시.
- 트레이 "종료" → 실행 중 프로세스 정리 후 앱 완전 종료(node 프로세스도 종료 확인).

- [ ] **Step 5: Commit**

```bash
git add src/main/main.ts src/main/tray.ts resources/tray-icon.png
git commit -m "feat: tray with minimize-on-close and cleanup-on-quit"
```

---

### Task 8: 설정 UI + 가져오기/내보내기

**Files:**

- Create: `src/renderer/features/settings/SettingsDialog.tsx`
- Create: `src/renderer/stores/settings.ts`
- Modify: `src/renderer/App.tsx` (헤더에 설정 버튼)

**Interfaces:**

- Consumes: `settings:get/set`, `programs:export/import`, shadcn.
- Produces: 설정 다이얼로그(로그 버퍼 줄 수, 파일 저장, 기본 정규식) + 프로그램 내보내기(파일 저장)/가져오기(붙여넣기).

- [ ] **Step 1: settings 스토어**

Create `src/renderer/stores/settings.ts`:

```ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Settings } from '../../shared/types'

interface SettingsState {
  settings: Settings | null
  load: () => Promise<void>
  save: (s: Settings) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  load: async () => set({ settings: await ipc.invoke('settings:get') }),
  save: async (s) => set({ settings: await ipc.invoke('settings:set', s) })
}))
```

- [ ] **Step 2: 설정 다이얼로그**

Create `src/renderer/features/settings/SettingsDialog.tsx`:

```tsx
import { useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useSettingsStore } from '../../stores/settings'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'

export function SettingsDialog({ trigger }: { trigger: React.ReactNode }) {
  const { settings, load, save } = useSettingsStore()
  const reloadPrograms = useProgramsStore((s) => s.load)
  useEffect(() => {
    load()
  }, [load])

  const exportPrograms = async () => {
    const json = await ipc.invoke('programs:export')
    await navigator.clipboard.writeText(json)
    alert('프로그램 정의가 클립보드에 복사되었습니다.')
  }
  const importPrograms = async () => {
    const json = prompt('가져올 프로그램 JSON을 붙여넣으세요:')
    if (json) {
      await ipc.invoke('programs:import', json)
      await reloadPrograms()
    }
  }

  if (!settings) return <>{trigger}</>

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>설정</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>로그 버퍼 줄 수</Label>
            <Input
              type="number"
              value={settings.logBufferLines}
              onChange={(e) => save({ ...settings, logBufferLines: Number(e.target.value) })}
            />
          </div>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.logToFile}
              onCheckedChange={(c) => save({ ...settings, logToFile: c })}
            />
            로그 파일 저장
          </label>
          <div>
            <Label>기본 로그 URL 정규식</Label>
            <Input
              value={settings.defaultLogPattern}
              onChange={(e) => save({ ...settings, defaultLogPattern: e.target.value })}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={exportPrograms}>
              프로그램 내보내기
            </Button>
            <Button variant="outline" onClick={importPrograms}>
              가져오기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: 헤더에 설정 버튼**

`App.tsx`의 header를 수정:

```tsx
import { SettingsDialog } from './features/settings/SettingsDialog'
import { Button } from '@/components/ui/button'
// <header className="px-4 py-3 border-b font-semibold flex items-center justify-between">
//   <span>Tool Launcher</span>
//   <SettingsDialog trigger={<Button variant="outline" size="sm">설정</Button>} />
// </header>
```

- [ ] **Step 4: 수동 검증**

Run: `npm run dev`
Expected: 설정 다이얼로그에서 값 변경 → 저장됨(재시작 후 유지). 내보내기 → 클립보드 복사. 가져오기 → 목록 갱신.

- [ ] **Step 5: 타입체크 + 테스트 + Commit**

```bash
npx tsc --noEmit && npm test
git add src/renderer
git commit -m "feat: settings dialog with import/export of programs"
```

---

## Self-Review (M2)

**Spec coverage (M2 범위):**

- "열기" 모드 집합(none/url/url-from-log/path) + 자동열기 → Task 1, 2, 3 ✓
- 추가/편집 폼(프로세스 여러 개, open 조건부, 폴더 선택) → Task 6 ✓
- git clone/pull(옵션) + 진행 로그 → Task 4 ✓
- 트레이 최소화 + 종료 시 정리 → Task 7 ✓
- 설정(로그 버퍼/파일/정규식) + 가져오기/내보내기 → Task 8 ✓
- (M3로 이연) autoPullOnStart 실제 시작 훅 연결은 선택 — 필요 시 ProcessManager.start 전 git.pull 호출하는 얇은 코디네이터를 register-ipc의 `programs:start`에 추가(아래 메모).

**메모 — autoPullOnStart 연결(선택, M2에서 추가 권장):** `register-ipc.ts`의 `programs:start` 핸들러에서 program 조회 후 `if (program.git?.autoPullOnStart) await git.pull(program.workingDir, line => win.webContents.send('git:progress', { text: line }))`를 `processes.start` 앞에 넣는다.

**Type consistency:** `OpenSpec`/`ProgramRuntime.resolvedOpenTarget`는 M1 타입을 그대로 사용. `git:clone`/`git:progress` 채널은 Task 3에서 계약에 추가 후 Task 4에서 사용. `useProgramsStore`의 create/update/remove/load 시그니처는 Task 6에서 정의·사용 일관.

**Placeholder scan:** UI 연결 지점은 주석으로 "이 위치에 삽입"을 표기하되 삽입할 코드 전체를 제공. 트레이 아이콘은 임시 PNG 허용(M3에서 교체) — 기능 동작에는 충분.

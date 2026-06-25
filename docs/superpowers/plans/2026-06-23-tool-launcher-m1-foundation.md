# Tool Launcher M1 — 기반 + 코어 런타임 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron 데스크톱 런처의 기반과 코어 런타임을 만들어, 로컬 프로그램(다중 프로세스 포함)을 등록·시작·종료하고 상태와 로그를 볼 수 있게 한다.

**Architecture:** Electron 멀티프로세스 구조. `main`(Node)이 자식 프로세스를 소유·관리(ProcessManager/LogStore/Store), `renderer`(React)는 IPC로 명령을 보내고 상태/로그를 구독만 한다. 코어 로직(`main/core`)은 electron 의존이 0이라 단위 테스트가 쉽다. main↔renderer는 `shared/`의 타입 계약으로 묶인다.

**Tech Stack:** Electron, electron-vite, TypeScript(strict), React, Tailwind, Zustand, Vitest, zod(런타임 검증), tree-kill(프로세스 트리 종료).

## Global Constraints

- 지원 OS: macOS, Windows, Linux. 프로세스 종료는 트리 단위(자식까지) — POSIX 그룹 kill / Windows taskkill, 라이브러리는 `tree-kill`.
- TypeScript `strict: true`. 모든 소스는 TS.
- 보안: `contextIsolation: true`, `nodeIntegration: false`. renderer는 `main/`을 직접 import 금지 — `shared/` + IPC만 경유.
- `main/core/*`는 electron API import 금지(순수 로직, 주입식 의존성).
- 커밋 메시지는 Conventional Commits(`feat:`/`fix:`/`chore:`/`test:`/`docs:`).
- 데이터 저장 위치는 Electron `userData` 폴더의 `programs.json` / `settings.json`. 코어에는 baseDir를 주입한다(테스트는 임시 폴더 사용).

---

### Task 1: 프로젝트 스캐폴드 (electron-vite + React + TS)

**Files:**

- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `.gitignore`
- Create: `src/main/main.ts`, `src/preload/preload.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`
- Create: `vitest.config.ts`

**Interfaces:**

- Produces: 실행 가능한 빈 Electron 앱, `npm run dev`로 창이 뜸. `npm test`로 Vitest 실행 가능.

- [ ] **Step 1: electron-vite 스캐폴드 생성**

빈 디렉터리에서 실행(이미 `docs/`가 있으므로 현재 폴더에 생성):

```bash
npm create @quick-start/electron@latest . -- --template react-ts
```

프롬프트가 나오면 현재 디렉터리 사용에 동의. 이 템플릿은 `src/main`, `src/preload`, `src/renderer` 구조와 `electron.vite.config.ts`를 만든다.

- [ ] **Step 2: 의존성 설치 + 추가 라이브러리**

```bash
npm install
npm install zustand zod tree-kill
npm install -D vitest @types/node
```

- [ ] **Step 3: Vitest 설정 추가**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
```

`package.json`의 `scripts`에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: tsconfig strict 확인**

`tsconfig.node.json`(또는 메인 tsconfig)에 다음이 있는지 확인하고 없으면 추가:

```json
"compilerOptions": {
  "strict": true,
  "noUncheckedIndexedAccess": true
}
```

- [ ] **Step 5: 앱이 뜨는지 확인**

Run: `npm run dev`
Expected: Electron 창이 뜨고 템플릿 화면 표시. 확인 후 종료.

- [ ] **Step 6: 테스트 러너 동작 확인**

임시로 `src/sanity.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: PASS. 확인 후 `src/sanity.test.ts` 삭제.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite react-ts project with vitest"
```

---

### Task 2: 공유 타입 + zod 스키마

**Files:**

- Create: `src/shared/types.ts`
- Create: `src/shared/schema.ts`
- Test: `src/shared/schema.test.ts`

**Interfaces:**

- Produces:
  - 타입 `OpenMode`, `OpenSpec`, `ProcessSpec`, `GitSpec`, `Program`, `ProgramStatus`, `Settings`, `LogLine`, `ProgramRuntime`.
  - `programSchema` (zod), `settingsSchema` (zod), `parseProgram(data): Program`, `parseSettings(data): Settings`.

- [ ] **Step 1: 타입 정의**

Create `src/shared/types.ts`:

```ts
export type OpenMode = 'none' | 'url' | 'url-from-log' | 'path'

export interface OpenSpec {
  mode: OpenMode
  value?: string
  logPattern?: string
  autoOpenOnStart: boolean
}

export interface ProcessSpec {
  name: string
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  order: number
  startDelayMs?: number
}

export interface GitSpec {
  repoUrl: string
  branch?: string
  autoPullOnStart?: boolean
}

export interface Program {
  id: string
  name: string
  workingDir: string
  git?: GitSpec
  processes: ProcessSpec[]
  open?: OpenSpec
}

export type ProgramStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface ProgramRuntime {
  programId: string
  status: ProgramStatus
  resolvedOpenTarget?: string
  error?: string
}

export interface LogLine {
  programId: string
  processName: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  ts: number
}

export interface Settings {
  logBufferLines: number
  logToFile: boolean
  defaultLogPattern: string
  theme: 'light' | 'dark' | 'system'
}

export const DEFAULT_SETTINGS: Settings = {
  logBufferLines: 2000,
  logToFile: false,
  defaultLogPattern: 'https?://[^\\s]+',
  theme: 'system'
}
```

- [ ] **Step 2: 실패하는 스키마 테스트 작성**

Create `src/shared/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseProgram, parseSettings } from './schema'
import { DEFAULT_SETTINGS } from './types'

describe('parseProgram', () => {
  it('accepts a valid minimal program', () => {
    const p = parseProgram({
      id: 'a',
      name: 'X',
      workingDir: '/tmp',
      processes: [{ name: 'p1', command: 'echo', order: 0 }]
    })
    expect(p.name).toBe('X')
    expect(p.processes[0].command).toBe('echo')
  })

  it('rejects a program with no processes', () => {
    expect(() => parseProgram({ id: 'a', name: 'X', workingDir: '/tmp', processes: [] })).toThrow()
  })

  it('rejects invalid open mode', () => {
    expect(() =>
      parseProgram({
        id: 'a',
        name: 'X',
        workingDir: '/tmp',
        processes: [{ name: 'p1', command: 'echo', order: 0 }],
        open: { mode: 'bogus', autoOpenOnStart: false }
      })
    ).toThrow()
  })
})

describe('parseSettings', () => {
  it('fills defaults for missing fields', () => {
    const s = parseSettings({})
    expect(s).toEqual(DEFAULT_SETTINGS)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/shared/schema.test.ts`
Expected: FAIL ("Cannot find module './schema'").

- [ ] **Step 4: zod 스키마 구현**

Create `src/shared/schema.ts`:

```ts
import { z } from 'zod'
import { DEFAULT_SETTINGS, type Program, type Settings } from './types'

const openSpecSchema = z.object({
  mode: z.enum(['none', 'url', 'url-from-log', 'path']),
  value: z.string().optional(),
  logPattern: z.string().optional(),
  autoOpenOnStart: z.boolean().default(false)
})

const processSpecSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  order: z.number().int(),
  startDelayMs: z.number().int().nonnegative().optional()
})

const gitSpecSchema = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().optional(),
  autoPullOnStart: z.boolean().optional()
})

export const programSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  workingDir: z.string().min(1),
  git: gitSpecSchema.optional(),
  processes: z.array(processSpecSchema).min(1),
  open: openSpecSchema.optional()
})

export const settingsSchema = z.object({
  logBufferLines: z.number().int().positive().default(DEFAULT_SETTINGS.logBufferLines),
  logToFile: z.boolean().default(DEFAULT_SETTINGS.logToFile),
  defaultLogPattern: z.string().default(DEFAULT_SETTINGS.defaultLogPattern),
  theme: z.enum(['light', 'dark', 'system']).default(DEFAULT_SETTINGS.theme)
})

export function parseProgram(data: unknown): Program {
  return programSchema.parse(data) as Program
}

export function parseSettings(data: unknown): Settings {
  return settingsSchema.parse(data ?? {})
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/shared/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/schema.ts src/shared/schema.test.ts
git commit -m "feat: add shared types and zod validation schemas"
```

---

### Task 3: IPC 계약 정의

**Files:**

- Create: `src/shared/ipc.ts`

**Interfaces:**

- Produces:
  - `IpcApi` (invoke 채널: renderer→main, Promise 반환).
  - `IpcEvents` (event 채널: main→renderer).
  - `INVOKE_CHANNELS`, `EVENT_CHANNELS` 상수 배열.

- [ ] **Step 1: 계약 작성**

Create `src/shared/ipc.ts`:

```ts
import type { Program, ProgramRuntime, LogLine, Settings } from './types'

// invoke: renderer가 호출하고 main이 응답(Promise)
export interface IpcApi {
  'programs:list': () => Promise<Program[]>
  'programs:create': (p: Omit<Program, 'id'>) => Promise<Program>
  'programs:update': (p: Program) => Promise<Program>
  'programs:delete': (id: string) => Promise<void>
  'programs:start': (id: string) => Promise<void>
  'programs:stop': (id: string) => Promise<void>
  'programs:open': (id: string) => Promise<void>
  'programs:import': (json: string) => Promise<Program[]>
  'programs:export': () => Promise<string>
  'runtime:list': () => Promise<ProgramRuntime[]>
  'logs:get': (programId: string) => Promise<LogLine[]>
  'settings:get': () => Promise<Settings>
  'settings:set': (s: Settings) => Promise<Settings>
  'dialog:pickDirectory': () => Promise<string | null>
}

// event: main이 renderer로 푸시
export interface IpcEvents {
  'runtime:changed': ProgramRuntime
  'logs:appended': LogLine[]
}

export const INVOKE_CHANNELS = [
  'programs:list',
  'programs:create',
  'programs:update',
  'programs:delete',
  'programs:start',
  'programs:stop',
  'programs:open',
  'programs:import',
  'programs:export',
  'runtime:list',
  'logs:get',
  'settings:get',
  'settings:set',
  'dialog:pickDirectory'
] as const satisfies ReadonlyArray<keyof IpcApi>

export const EVENT_CHANNELS = ['runtime:changed', 'logs:appended'] as const satisfies ReadonlyArray<
  keyof IpcEvents
>
```

- [ ] **Step 2: 타입체크 확인**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "feat: define typed IPC contract between main and renderer"
```

---

### Task 4: Store (programs.json / settings.json 영속)

**Files:**

- Create: `src/main/core/store.ts`
- Test: `src/main/core/store.test.ts`

**Interfaces:**

- Consumes: `parseProgram`, `parseSettings` (Task 2), 타입 (Task 2).
- Produces: `class Store`
  - `constructor(baseDir: string)`
  - `listPrograms(): Program[]`
  - `createProgram(p: Omit<Program,'id'>): Program` (id 생성·저장)
  - `updateProgram(p: Program): Program`
  - `deleteProgram(id: string): void`
  - `getSettings(): Settings` / `setSettings(s: Settings): Settings`
  - `exportPrograms(): string` / `importPrograms(json: string): Program[]`
  - id 생성기는 주입 가능: `constructor(baseDir, idgen = () => randomUUID())`

- [ ] **Step 1: 실패 테스트 작성**

Create `src/main/core/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from './store'

let dir: string
let n: number
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tl-'))
  n = 0
})
const newStore = () => new Store(dir, () => `id-${n++}`)

const sample = {
  name: 'Web',
  workingDir: '/tmp',
  processes: [{ name: 'p', command: 'echo', order: 0 }]
}

describe('Store', () => {
  it('creates and lists programs with generated ids', () => {
    const s = newStore()
    const p = s.createProgram(sample)
    expect(p.id).toBe('id-0')
    expect(s.listPrograms()).toHaveLength(1)
  })

  it('persists across instances (same baseDir)', () => {
    newStore().createProgram(sample)
    const s2 = new Store(dir, () => 'x')
    expect(s2.listPrograms()).toHaveLength(1)
  })

  it('updates a program', () => {
    const s = newStore()
    const p = s.createProgram(sample)
    s.updateProgram({ ...p, name: 'Renamed' })
    expect(s.listPrograms()[0].name).toBe('Renamed')
  })

  it('deletes a program', () => {
    const s = newStore()
    const p = s.createProgram(sample)
    s.deleteProgram(p.id)
    expect(s.listPrograms()).toHaveLength(0)
  })

  it('returns default settings when none saved', () => {
    expect(newStore().getSettings().logBufferLines).toBeGreaterThan(0)
  })

  it('round-trips export/import', () => {
    const s = newStore()
    s.createProgram(sample)
    const json = s.exportPrograms()
    const s2 = new Store(mkdtempSync(join(tmpdir(), 'tl2-')), () => 'y')
    expect(s2.importPrograms(json)).toHaveLength(1)
  })

  it('rejects invalid program on create', () => {
    expect(() => newStore().createProgram({ ...sample, processes: [] } as any)).toThrow()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/main/core/store.test.ts`
Expected: FAIL ("Cannot find module './store'").

- [ ] **Step 3: Store 구현**

Create `src/main/core/store.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseProgram, parseSettings } from '../../shared/schema'
import type { Program, Settings } from '../../shared/types'

export class Store {
  private programsFile: string
  private settingsFile: string

  constructor(
    private baseDir: string,
    private idgen: () => string = () => randomUUID()
  ) {
    if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })
    this.programsFile = join(baseDir, 'programs.json')
    this.settingsFile = join(baseDir, 'settings.json')
  }

  private readPrograms(): Program[] {
    if (!existsSync(this.programsFile)) return []
    const raw = JSON.parse(readFileSync(this.programsFile, 'utf-8')) as unknown[]
    return raw.map((r) => parseProgram(r))
  }

  private writePrograms(programs: Program[]): void {
    writeFileSync(this.programsFile, JSON.stringify(programs, null, 2), 'utf-8')
  }

  listPrograms(): Program[] {
    return this.readPrograms()
  }

  createProgram(input: Omit<Program, 'id'>): Program {
    const program = parseProgram({ ...input, id: this.idgen() })
    const all = this.readPrograms()
    all.push(program)
    this.writePrograms(all)
    return program
  }

  updateProgram(program: Program): Program {
    const validated = parseProgram(program)
    const all = this.readPrograms().map((p) => (p.id === validated.id ? validated : p))
    this.writePrograms(all)
    return validated
  }

  deleteProgram(id: string): void {
    this.writePrograms(this.readPrograms().filter((p) => p.id !== id))
  }

  exportPrograms(): string {
    return JSON.stringify(this.readPrograms(), null, 2)
  }

  importPrograms(json: string): Program[] {
    const parsed = (JSON.parse(json) as unknown[]).map((r) => parseProgram(r))
    this.writePrograms(parsed)
    return parsed
  }

  getSettings(): Settings {
    if (!existsSync(this.settingsFile)) return parseSettings({})
    return parseSettings(JSON.parse(readFileSync(this.settingsFile, 'utf-8')))
  }

  setSettings(s: Settings): Settings {
    const validated = parseSettings(s)
    writeFileSync(this.settingsFile, JSON.stringify(validated, null, 2), 'utf-8')
    return validated
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/main/core/store.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/core/store.ts src/main/core/store.test.ts
git commit -m "feat: add Store for persisting programs and settings"
```

---

### Task 5: LogStore (프로세스별 링버퍼 + 구독)

**Files:**

- Create: `src/main/core/log-store.ts`
- Test: `src/main/core/log-store.test.ts`

**Interfaces:**

- Consumes: `LogLine` (Task 2).
- Produces: `class LogStore`
  - `constructor(maxLines: number)`
  - `append(line: LogLine): void`
  - `get(programId: string): LogLine[]`
  - `clear(programId: string): void`
  - `subscribe(cb: (lines: LogLine[]) => void): () => void` — 배치 콜백(연속 append를 마이크로태스크에 모아 1회 호출). unsubscribe 함수 반환.

- [ ] **Step 1: 실패 테스트 작성**

Create `src/main/core/log-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LogStore } from './log-store'
import type { LogLine } from '../../shared/types'

const line = (programId: string, text: string): LogLine => ({
  programId,
  processName: 'p',
  stream: 'stdout',
  text,
  ts: 0
})

describe('LogStore', () => {
  it('stores and returns lines per program', () => {
    const s = new LogStore(100)
    s.append(line('a', '1'))
    s.append(line('b', '2'))
    expect(s.get('a').map((l) => l.text)).toEqual(['1'])
    expect(s.get('b').map((l) => l.text)).toEqual(['2'])
  })

  it('caps the ring buffer at maxLines per program', () => {
    const s = new LogStore(2)
    s.append(line('a', '1'))
    s.append(line('a', '2'))
    s.append(line('a', '3'))
    expect(s.get('a').map((l) => l.text)).toEqual(['2', '3'])
  })

  it('clears a program log', () => {
    const s = new LogStore(10)
    s.append(line('a', '1'))
    s.clear('a')
    expect(s.get('a')).toEqual([])
  })

  it('notifies subscribers in a batch', async () => {
    const s = new LogStore(10)
    const batches: LogLine[][] = []
    s.subscribe((lines) => batches.push(lines))
    s.append(line('a', '1'))
    s.append(line('a', '2'))
    await Promise.resolve()
    await Promise.resolve()
    expect(batches).toHaveLength(1)
    expect(batches[0].map((l) => l.text)).toEqual(['1', '2'])
  })

  it('stops notifying after unsubscribe', async () => {
    const s = new LogStore(10)
    let count = 0
    const off = s.subscribe(() => {
      count++
    })
    off()
    s.append(line('a', '1'))
    await Promise.resolve()
    await Promise.resolve()
    expect(count).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/main/core/log-store.test.ts`
Expected: FAIL ("Cannot find module './log-store'").

- [ ] **Step 3: LogStore 구현**

Create `src/main/core/log-store.ts`:

```ts
import type { LogLine } from '../../shared/types'

export class LogStore {
  private buffers = new Map<string, LogLine[]>()
  private subscribers = new Set<(lines: LogLine[]) => void>()
  private pending: LogLine[] = []
  private flushScheduled = false

  constructor(private maxLines: number) {}

  append(line: LogLine): void {
    const buf = this.buffers.get(line.programId) ?? []
    buf.push(line)
    if (buf.length > this.maxLines) buf.splice(0, buf.length - this.maxLines)
    this.buffers.set(line.programId, buf)

    this.pending.push(line)
    if (!this.flushScheduled) {
      this.flushScheduled = true
      queueMicrotask(() => this.flush())
    }
  }

  private flush(): void {
    this.flushScheduled = false
    if (this.pending.length === 0) return
    const batch = this.pending
    this.pending = []
    for (const cb of this.subscribers) cb(batch)
  }

  get(programId: string): LogLine[] {
    return [...(this.buffers.get(programId) ?? [])]
  }

  clear(programId: string): void {
    this.buffers.delete(programId)
  }

  subscribe(cb: (lines: LogLine[]) => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/main/core/log-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/core/log-store.ts src/main/core/log-store.test.ts
git commit -m "feat: add LogStore with per-program ring buffer and batched subscribe"
```

---

### Task 6: ProcessManager — 단일 프로세스 시작 + 상태

**Files:**

- Create: `src/main/core/process-manager.ts`
- Test: `src/main/core/process-manager.test.ts`
- Create: `src/main/core/test-helpers.ts`

**Interfaces:**

- Consumes: `Program`, `ProcessSpec`, `ProgramStatus`, `ProgramRuntime`, `LogLine`, `LogStore`.
- Produces: `class ProcessManager`
  - 주입식 의존성:
    ```ts
    interface ProcessDeps {
      spawn: (
        command: string,
        args: string[],
        opts: { cwd?: string; env?: NodeJS.ProcessEnv; detached?: boolean }
      ) => ChildLike
      killTree: (pid: number, signal: string) => Promise<void>
      now: () => number
    }
    interface ChildLike {
      pid?: number
      stdout: { on(ev: 'data', cb: (chunk: Buffer | string) => void): void } | null
      stderr: { on(ev: 'data', cb: (chunk: Buffer | string) => void): void } | null
      on(ev: 'exit', cb: (code: number | null, signal: string | null) => void): void
      kill(signal?: string): boolean
    }
    ```
  - `constructor(logStore: LogStore, deps: ProcessDeps)`
  - `start(program: Program): Promise<void>`
  - `getRuntime(programId: string): ProgramRuntime`
  - `onRuntimeChange(cb: (rt: ProgramRuntime) => void): () => void`
- 이 태스크에서는 **단일 프로세스 시작 + running/error 상태**만. 종료·다중·크래시는 Task 7~9.

- [ ] **Step 1: 테스트 헬퍼(FakeChild) 작성**

Create `src/main/core/test-helpers.ts`:

```ts
import { EventEmitter } from 'node:events'
import type { ChildLike, ProcessDeps } from './process-manager'

export class FakeChild extends EventEmitter implements ChildLike {
  pid = Math.floor(Math.random() * 100000) + 1
  stdout = new EventEmitter() as any
  stderr = new EventEmitter() as any
  killed = false
  kill(signal?: string): boolean {
    this.killed = true
    // 실제 종료는 테스트가 emit('exit')로 흉내냄
    return true
  }
  emitStdout(text: string) {
    this.stdout.emit('data', Buffer.from(text))
  }
  emitExit(code: number | null, signal: string | null = null) {
    this.emit('exit', code, signal)
  }
}

export function makeFakeDeps(): { deps: ProcessDeps; children: FakeChild[] } {
  const children: FakeChild[] = []
  const deps: ProcessDeps = {
    spawn: () => {
      const c = new FakeChild()
      children.push(c)
      return c
    },
    killTree: async () => {},
    now: () => 0
  }
  return { deps, children }
}
```

> 주의: `now: () => 0`이므로 `Date.now()`를 직접 쓰지 말고 `deps.now()`를 쓴다.

- [ ] **Step 2: 실패 테스트 작성**

Create `src/main/core/process-manager.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ProcessManager } from './process-manager'
import { LogStore } from './log-store'
import { makeFakeDeps } from './test-helpers'
import type { Program } from '../../shared/types'

const prog = (over: Partial<Program> = {}): Program => ({
  id: 'a',
  name: 'X',
  workingDir: '/tmp',
  processes: [{ name: 'p1', command: 'node', args: ['x.js'], order: 0 }],
  ...over
})

describe('ProcessManager.start (single process)', () => {
  it('transitions stopped -> starting -> running', async () => {
    const { deps } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    const seen: string[] = []
    pm.onRuntimeChange((rt) => seen.push(rt.status))
    await pm.start(prog())
    expect(pm.getRuntime('a').status).toBe('running')
    expect(seen).toContain('starting')
    expect(seen).toContain('running')
  })

  it('captures stdout into the log store', async () => {
    const { deps, children } = makeFakeDeps()
    const logs = new LogStore(100)
    const pm = new ProcessManager(logs, deps)
    await pm.start(prog())
    children[0].emitStdout('hello\nworld\n')
    expect(logs.get('a').map((l) => l.text)).toEqual(['hello', 'world'])
  })

  it('marks error if spawn throws', async () => {
    const { deps } = makeFakeDeps()
    deps.spawn = () => {
      throw new Error('ENOENT')
    }
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(prog())
    expect(pm.getRuntime('a').status).toBe('error')
    expect(pm.getRuntime('a').error).toContain('ENOENT')
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/main/core/process-manager.test.ts`
Expected: FAIL ("Cannot find module './process-manager'").

- [ ] **Step 4: ProcessManager 구현 (단일 시작분)**

Create `src/main/core/process-manager.ts`:

```ts
import { join } from 'node:path'
import type { LogStore } from './log-store'
import type {
  Program,
  ProcessSpec,
  ProgramRuntime,
  ProgramStatus,
  LogLine
} from '../../shared/types'

export interface ChildLike {
  pid?: number
  stdout: { on(ev: 'data', cb: (chunk: Buffer | string) => void): void } | null
  stderr: { on(ev: 'data', cb: (chunk: Buffer | string) => void): void } | null
  on(ev: 'exit', cb: (code: number | null, signal: string | null) => void): void
  kill(signal?: string): boolean
}

export interface ProcessDeps {
  spawn: (
    command: string,
    args: string[],
    opts: { cwd?: string; env?: NodeJS.ProcessEnv; detached?: boolean }
  ) => ChildLike
  killTree: (pid: number, signal: string) => Promise<void>
  now: () => number
}

interface RunningProc {
  spec: ProcessSpec
  child: ChildLike
  stopping: boolean
}

interface ProgramState {
  status: ProgramStatus
  error?: string
  resolvedOpenTarget?: string
  procs: RunningProc[]
}

export class ProcessManager {
  private states = new Map<string, ProgramState>()
  private listeners = new Set<(rt: ProgramRuntime) => void>()

  constructor(
    private logs: LogStore,
    private deps: ProcessDeps
  ) {}

  getRuntime(programId: string): ProgramRuntime {
    const st = this.states.get(programId)
    return {
      programId,
      status: st?.status ?? 'stopped',
      error: st?.error,
      resolvedOpenTarget: st?.resolvedOpenTarget
    }
  }

  onRuntimeChange(cb: (rt: ProgramRuntime) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private setStatus(programId: string, patch: Partial<ProgramState>): void {
    const st = this.states.get(programId)
    if (!st) return
    Object.assign(st, patch)
    for (const cb of this.listeners) cb(this.getRuntime(programId))
  }

  private log(
    programId: string,
    processName: string,
    stream: LogLine['stream'],
    text: string
  ): void {
    this.logs.append({ programId, processName, stream, text, ts: this.deps.now() })
  }

  private pipe(programId: string, spec: ProcessSpec, child: ChildLike): void {
    const onData = (stream: 'stdout' | 'stderr') => (chunk: Buffer | string) => {
      const lines = chunk.toString().split('\n')
      for (const l of lines) if (l.length > 0) this.log(programId, spec.name, stream, l)
    }
    child.stdout?.on('data', onData('stdout'))
    child.stderr?.on('data', onData('stderr'))
  }

  async start(program: Program): Promise<void> {
    this.states.set(program.id, { status: 'starting', procs: [] })
    this.setStatus(program.id, {})

    const ordered = [...program.processes].sort((a, b) => a.order - b.order)
    try {
      for (const spec of ordered) {
        const child = this.deps.spawn(spec.command, spec.args ?? [], {
          cwd: spec.cwd ?? program.workingDir,
          env: { ...process.env, ...spec.env },
          detached: process.platform !== 'win32'
        })
        this.pipe(program.id, spec, child)
        const running: RunningProc = { spec, child, stopping: false }
        this.states.get(program.id)!.procs.push(running)
      }
      this.setStatus(program.id, { status: 'running', error: undefined })
    } catch (err) {
      this.setStatus(program.id, { status: 'error', error: (err as Error).message })
    }
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/main/core/process-manager.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/core/process-manager.ts src/main/core/process-manager.test.ts src/main/core/test-helpers.ts
git commit -m "feat: ProcessManager start single process with status and log capture"
```

---

### Task 7: ProcessManager — 종료 + 프로세스 트리 킬

**Files:**

- Modify: `src/main/core/process-manager.ts`
- Modify: `src/main/core/process-manager.test.ts`

**Interfaces:**

- Produces (추가): `stop(programId: string): Promise<void>` — 역순 종료, `killTree(pid, 'SIGTERM')` 후 유예시간 내 미종료 시 `killTree(pid, 'SIGKILL')`. 종료 완료 시 status `stopped`.
  - 유예시간은 주입: `constructor(logStore, deps, opts?: { stopGraceMs?: number })` (기본 5000, 테스트는 작게).

- [ ] **Step 1: 실패 테스트 추가**

`src/main/core/process-manager.test.ts`에 추가:

```ts
describe('ProcessManager.stop', () => {
  it('kills processes and transitions to stopped', async () => {
    const { deps, children } = makeFakeDeps()
    const killed: Array<[number, string]> = []
    deps.killTree = async (pid, sig) => {
      killed.push([pid, sig])
      // SIGTERM에 정상 종료되는 프로세스 흉내
      children.find((c) => c.pid === pid)?.emitExit(0, sig)
    }
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 50 })
    await pm.start(prog())
    await pm.stop('a')
    expect(pm.getRuntime('a').status).toBe('stopped')
    expect(killed[0][1]).toBe('SIGTERM')
  })

  it('escalates to SIGKILL if process ignores SIGTERM', async () => {
    const { deps } = makeFakeDeps()
    const signals: string[] = []
    deps.killTree = async (_pid, sig) => {
      signals.push(sig)
    } // 절대 exit 안 함
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 20 })
    await pm.start(prog())
    await pm.stop('a')
    expect(signals).toContain('SIGTERM')
    expect(signals).toContain('SIGKILL')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/main/core/process-manager.test.ts`
Expected: FAIL (`stop is not a function`).

- [ ] **Step 3: stop 구현**

`process-manager.ts` 수정 — 생성자에 opts 추가, exit 리스너에서 종료 추적, stop 메서드 추가.

생성자 교체:

```ts
  private stopGraceMs: number
  constructor(
    private logs: LogStore,
    private deps: ProcessDeps,
    opts?: { stopGraceMs?: number },
  ) {
    this.stopGraceMs = opts?.stopGraceMs ?? 5000
  }
```

`start()`의 spawn 직후, `this.pipe(...)` 다음에 exit 추적 추가:

```ts
child.on('exit', () => {
  running.exited = true
})
```

`RunningProc`에 필드 추가:

```ts
interface RunningProc {
  spec: ProcessSpec
  child: ChildLike
  stopping: boolean
  exited?: boolean
}
```

클래스에 메서드 추가:

```ts
  async stop(programId: string): Promise<void> {
    const st = this.states.get(programId)
    if (!st || st.status === 'stopped') return
    const reversed = [...st.procs].reverse()
    for (const rp of reversed) {
      rp.stopping = true
      const pid = rp.child.pid
      if (pid === undefined || rp.exited) continue
      await this.deps.killTree(pid, 'SIGTERM')
      const exited = await this.waitExit(rp, this.stopGraceMs)
      if (!exited) await this.deps.killTree(pid, 'SIGKILL')
    }
    st.procs = []
    this.setStatus(programId, { status: 'stopped', error: undefined })
  }

  private waitExit(rp: RunningProc, ms: number): Promise<boolean> {
    if (rp.exited) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms)
      rp.child.on('exit', () => { clearTimeout(timer); resolve(true) })
    })
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/main/core/process-manager.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/core/process-manager.ts src/main/core/process-manager.test.ts
git commit -m "feat: ProcessManager stop with reverse order and SIGTERM->SIGKILL tree kill"
```

---

### Task 8: ProcessManager — 다중 프로세스(순서·지연) + 크래시 감지

**Files:**

- Modify: `src/main/core/process-manager.ts`
- Modify: `src/main/core/process-manager.test.ts`

**Interfaces:**

- Produces (추가/변경):
  - `start()`가 `startDelayMs`를 지원 — 다음 프로세스 spawn 전 `deps.delay(ms)` 대기. `ProcessDeps`에 `delay: (ms: number) => Promise<void>` 추가(테스트는 즉시 resolve).
  - 크래시 감지: `stopping=false`인 프로세스가 exit하면 program status `error`로 전환(메시지 "process <name> exited unexpectedly").

- [ ] **Step 1: 실패 테스트 추가**

먼저 `test-helpers.ts`의 `makeFakeDeps`에 `delay` 추가:

```ts
const deps: ProcessDeps = {
  spawn: () => {
    const c = new FakeChild()
    children.push(c)
    return c
  },
  killTree: async () => {},
  now: () => 0,
  delay: async () => {}
}
```

`process-manager.test.ts`에 추가:

```ts
describe('ProcessManager multi-process and crash', () => {
  it('starts processes in order', async () => {
    const { deps } = makeFakeDeps()
    const order: string[] = []
    const realSpawn = deps.spawn
    deps.spawn = (cmd, args, opts) => {
      order.push(cmd)
      return realSpawn(cmd, args, opts)
    }
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(
      prog({
        processes: [
          { name: 'b', command: 'second', order: 1 },
          { name: 'a', command: 'first', order: 0 }
        ]
      })
    )
    expect(order).toEqual(['first', 'second'])
  })

  it('marks program error when a process crashes unexpectedly', async () => {
    const { deps, children } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(prog())
    children[0].emitExit(1, null) // 종료 요청 없이 죽음
    expect(pm.getRuntime('a').status).toBe('error')
  })

  it('does NOT mark error when process exits during stop', async () => {
    const { deps, children } = makeFakeDeps()
    deps.killTree = async (pid) => {
      children.find((c) => c.pid === pid)?.emitExit(0, 'SIGTERM')
    }
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 50 })
    await pm.start(prog())
    await pm.stop('a')
    expect(pm.getRuntime('a').status).toBe('stopped')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/main/core/process-manager.test.ts`
Expected: FAIL (순서 테스트 또는 크래시 테스트 실패; `delay` 미사용/크래시 미감지).

- [ ] **Step 3: 구현 수정**

`ProcessDeps`에 추가:

```ts
delay: (ms: number) => Promise<void>
```

`start()`에서 exit 리스너를 크래시 감지로 확장(기존 `child.on('exit', () => { running.exited = true })` 교체):

```ts
child.on('exit', (code) => {
  running.exited = true
  if (!running.stopping) {
    this.setStatus(program.id, {
      status: 'error',
      error: `process ${spec.name} exited unexpectedly (code ${code})`
    })
  }
})
```

`start()`의 루프에서 spawn 사이 지연 추가(각 프로세스 spawn·pipe 등록 후):

```ts
if (spec.startDelayMs && spec.startDelayMs > 0) {
  await this.deps.delay(spec.startDelayMs)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/main/core/process-manager.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: 전체 코어 테스트 확인**

Run: `npm test`
Expected: 모든 테스트 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/core/process-manager.ts src/main/core/process-manager.test.ts src/main/core/test-helpers.ts
git commit -m "feat: ProcessManager ordered start with delay and crash detection"
```

---

### Task 9: 실제 의존성 어댑터 (child_process + tree-kill)

**Files:**

- Create: `src/main/core/real-deps.ts`
- Test: `src/main/core/real-deps.test.ts`
- Create: `src/main/fixtures/dummy-server.cjs`

**Interfaces:**

- Consumes: `ProcessDeps` (Task 6).
- Produces: `createRealDeps(): ProcessDeps` — `spawn`은 `child_process.spawn`, `killTree`는 `tree-kill`을 Promise로 래핑, `now`는 `Date.now`, `delay`는 setTimeout.
- 통합 테스트: 실제 node 스크립트를 띄워 stdout 캡처·정상 종료 검증.

- [ ] **Step 1: 더미 서버 픽스처 작성**

Create `src/main/fixtures/dummy-server.cjs`:

```js
// 시작 시 URL을 찍고, SIGTERM 받을 때까지 살아있는 더미 프로세스
console.log('Running on http://127.0.0.1:8888')
setInterval(() => {}, 1000)
process.on('SIGTERM', () => process.exit(0))
```

- [ ] **Step 2: 실패 통합 테스트 작성**

Create `src/main/core/real-deps.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { ProcessManager } from './process-manager'
import { LogStore } from './log-store'
import { createRealDeps } from './real-deps'
import type { Program } from '../../shared/types'

const fixture = join(__dirname, '..', 'fixtures', 'dummy-server.cjs')
const prog: Program = {
  id: 'real',
  name: 'Dummy',
  workingDir: process.cwd(),
  processes: [{ name: 'server', command: process.execPath, args: [fixture], order: 0 }]
}

describe('createRealDeps (integration)', () => {
  it('spawns a real process, captures stdout, and stops it', async () => {
    const logs = new LogStore(100)
    const pm = new ProcessManager(logs, createRealDeps(), { stopGraceMs: 2000 })
    await pm.start(prog)
    // stdout가 비동기로 들어오므로 잠시 대기
    await new Promise((r) => setTimeout(r, 500))
    expect(logs.get('real').some((l) => l.text.includes('http://127.0.0.1:8888'))).toBe(true)
    await pm.stop('real')
    expect(pm.getRuntime('real').status).toBe('stopped')
  }, 15000)
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/main/core/real-deps.test.ts`
Expected: FAIL ("Cannot find module './real-deps'").

- [ ] **Step 4: 어댑터 구현**

Create `src/main/core/real-deps.ts`:

```ts
import { spawn as nodeSpawn } from 'node:child_process'
import treeKill from 'tree-kill'
import type { ProcessDeps } from './process-manager'

export function createRealDeps(): ProcessDeps {
  return {
    spawn: (command, args, opts) =>
      nodeSpawn(command, args, {
        cwd: opts.cwd,
        env: opts.env,
        detached: opts.detached,
        shell: false
      }),
    killTree: (pid, signal) =>
      new Promise<void>((resolve) => treeKill(pid, signal, () => resolve())),
    now: () => Date.now(),
    delay: (ms) => new Promise((r) => setTimeout(r, ms))
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/main/core/real-deps.test.ts`
Expected: PASS (1 test). (느릴 수 있음)

- [ ] **Step 6: Commit**

```bash
git add src/main/core/real-deps.ts src/main/core/real-deps.test.ts src/main/fixtures/dummy-server.cjs
git commit -m "feat: real ProcessDeps adapter using child_process and tree-kill"
```

---

### Task 10: IPC 핸들러 등록 (main/ipc)

**Files:**

- Create: `src/main/ipc/register-ipc.ts`
- Create: `src/main/app-context.ts`

**Interfaces:**

- Consumes: `Store`, `ProcessManager`, `LogStore`, `IpcApi`, `INVOKE_CHANNELS` (이전 태스크들).
- Produces:
  - `interface AppContext { store: Store; processes: ProcessManager; logs: LogStore }`
  - `createAppContext(userDataDir: string): AppContext` — 실제 의존성으로 코어 객체 조립.
  - `registerIpc(ipcMain, win: BrowserWindow, ctx: AppContext): void` — 모든 invoke 채널 핸들러 등록 + runtime/logs 이벤트를 `win.webContents.send`로 전달.
- 이 태스크는 electron에 묶여 단위 테스트 대신 **타입체크 + 다음 태스크의 수동 실행**으로 검증.

- [ ] **Step 1: AppContext 작성**

Create `src/main/app-context.ts`:

```ts
import { Store } from './core/store'
import { LogStore } from './core/log-store'
import { ProcessManager } from './core/process-manager'
import { createRealDeps } from './core/real-deps'

export interface AppContext {
  store: Store
  logs: LogStore
  processes: ProcessManager
}

export function createAppContext(userDataDir: string): AppContext {
  const store = new Store(userDataDir)
  const settings = store.getSettings()
  const logs = new LogStore(settings.logBufferLines)
  const processes = new ProcessManager(logs, createRealDeps())
  return { store, logs, processes }
}
```

- [ ] **Step 2: IPC 등록기 작성**

Create `src/main/ipc/register-ipc.ts`:

```ts
import type { BrowserWindow, IpcMain } from 'electron'
import { shell, dialog } from 'electron'
import type { AppContext } from '../app-context'
import type { Program } from '../../shared/types'

export function registerIpc(ipcMain: IpcMain, win: BrowserWindow, ctx: AppContext): void {
  const { store, processes, logs } = ctx

  ipcMain.handle('programs:list', () => store.listPrograms())
  ipcMain.handle('programs:create', (_e, p: Omit<Program, 'id'>) => store.createProgram(p))
  ipcMain.handle('programs:update', (_e, p: Program) => store.updateProgram(p))
  ipcMain.handle('programs:delete', (_e, id: string) => store.deleteProgram(id))
  ipcMain.handle('programs:import', (_e, json: string) => store.importPrograms(json))
  ipcMain.handle('programs:export', () => store.exportPrograms())

  ipcMain.handle('programs:start', async (_e, id: string) => {
    const program = store.listPrograms().find((p) => p.id === id)
    if (program) await processes.start(program)
  })
  ipcMain.handle('programs:stop', async (_e, id: string) => {
    await processes.stop(id)
  })
  ipcMain.handle('programs:open', async (_e, id: string) => {
    const target = processes.getRuntime(id).resolvedOpenTarget
    if (target) await shell.openExternal(target)
  })

  ipcMain.handle('runtime:list', () => store.listPrograms().map((p) => processes.getRuntime(p.id)))
  ipcMain.handle('logs:get', (_e, programId: string) => logs.get(programId))

  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:set', (_e, s) => store.setSettings(s))

  ipcMain.handle('dialog:pickDirectory', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  processes.onRuntimeChange((rt) => {
    if (!win.isDestroyed()) win.webContents.send('runtime:changed', rt)
  })
  logs.subscribe((lines) => {
    if (!win.isDestroyed()) win.webContents.send('logs:appended', lines)
  })
}
```

- [ ] **Step 3: 타입체크 확인**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/main/app-context.ts src/main/ipc/register-ipc.ts
git commit -m "feat: wire core managers into IPC handlers and event forwarding"
```

---

### Task 11: preload 브리지 (타입 있는 window.api)

**Files:**

- Modify/Create: `src/preload/preload.ts`
- Create: `src/preload/api.d.ts`

**Interfaces:**

- Consumes: `IpcApi`, `IpcEvents`, `INVOKE_CHANNELS`, `EVENT_CHANNELS`.
- Produces: `window.api`
  - `invoke<K extends keyof IpcApi>(channel: K, ...args): ReturnType<IpcApi[K]>`
  - `on<K extends keyof IpcEvents>(channel: K, cb: (payload: IpcEvents[K]) => void): () => void`

- [ ] **Step 1: preload 구현**

Replace `src/preload/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE_CHANNELS, EVENT_CHANNELS } from '../shared/ipc'
import type { IpcApi, IpcEvents } from '../shared/ipc'

const api = {
  invoke: (channel: keyof IpcApi, ...args: unknown[]) => {
    if (!INVOKE_CHANNELS.includes(channel)) throw new Error(`blocked invoke: ${channel}`)
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: keyof IpcEvents, cb: (payload: unknown) => void) => {
    if (!EVENT_CHANNELS.includes(channel)) throw new Error(`blocked event: ${channel}`)
    const listener = (_e: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 2: renderer용 타입 선언**

Create `src/preload/api.d.ts`:

```ts
import type { IpcApi, IpcEvents } from '../shared/ipc'

export interface ExposedApi {
  invoke<K extends keyof IpcApi>(channel: K, ...args: Parameters<IpcApi[K]>): ReturnType<IpcApi[K]>
  on<K extends keyof IpcEvents>(channel: K, cb: (payload: IpcEvents[K]) => void): () => void
}

declare global {
  interface Window {
    api: ExposedApi
  }
}
```

- [ ] **Step 3: 타입체크 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음(설정에 따라 `tsconfig.web.json`/`tsconfig.node.json` 각각 확인).

- [ ] **Step 4: Commit**

```bash
git add src/preload/preload.ts src/preload/api.d.ts
git commit -m "feat: typed preload bridge exposing whitelisted window.api"
```

---

### Task 12: main.ts 조립 (창 + IPC)

**Files:**

- Modify: `src/main/main.ts`

**Interfaces:**

- Consumes: `createAppContext`, `registerIpc`.
- Produces: 앱 부팅 시 BrowserWindow 생성 + `registerIpc` 호출. `userData` 경로는 `app.getPath('userData')`.

- [ ] **Step 1: main.ts 작성**

`src/main/main.ts`의 창 생성 로직을 다음을 포함하도록 수정(템플릿 구조에 맞춰 BrowserWindow 생성 직후 IPC 등록):

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { createAppContext } from './app-context'
import { registerIpc } from './ipc/register-ipc'

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const ctx = createAppContext(app.getPath('userData'))
  registerIpc(ipcMain, win, ctx)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

> 주의: electron-vite 템플릿의 기존 `main.ts`에 preload 경로·loadURL 분기가 이미 있을 수 있다. 위 내용과 충돌하면 **IPC 등록 두 줄**(`createAppContext` + `registerIpc`)을 기존 `createWindow` 안 BrowserWindow 생성 직후에 끼워넣는 것으로 충분하다.

- [ ] **Step 2: 앱 실행 확인**

Run: `npm run dev`
Expected: 창이 뜨고 콘솔에 IPC 관련 에러 없음. (UI는 아직 템플릿)

- [ ] **Step 3: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: assemble app context and register IPC on window creation"
```

---

### Task 13: Tailwind 설정

**Files:**

- Create: `tailwind.config.js`, `postcss.config.js`
- Create/Modify: `src/renderer/index.css`
- Modify: `src/renderer/main.tsx`

**Interfaces:**

- Produces: Tailwind 유틸리티가 renderer에서 동작.

- [ ] **Step 1: 설치 + 초기화**

```bash
npm install -D tailwindcss@^3 postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: content 경로 설정**

`tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: []
}
```

- [ ] **Step 3: CSS 디렉티브**

`src/renderer/index.css` 내용을 다음으로 시작하도록:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`src/renderer/main.tsx`에서 `import './index.css'`가 있는지 확인(없으면 추가).

- [ ] **Step 4: 동작 확인**

`App.tsx`에 임시로 `<div className="text-2xl font-bold text-blue-600">Tailwind OK</div>` 넣고 `npm run dev`로 스타일 적용 확인 후 되돌림.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js postcss.config.js src/renderer/index.css src/renderer/main.tsx
git commit -m "chore: configure Tailwind CSS for renderer"
```

---

### Task 14: Renderer 상태 스토어 (Zustand) + IPC 클라이언트

**Files:**

- Create: `src/renderer/lib/ipc.ts`
- Create: `src/renderer/stores/programs.ts`
- Test: `src/renderer/stores/programs.test.ts`

**Interfaces:**

- Consumes: `window.api`, 타입들.
- Produces:
  - `lib/ipc.ts`: `const ipc = window.api` 재노출 + 편의 함수.
  - `stores/programs.ts`: `useProgramsStore` — `programs: Program[]`, `runtimes: Record<string, ProgramRuntime>`, `load()`, `applyRuntime(rt)`. (start/stop은 IPC 직접 호출)

- [ ] **Step 1: 실패 테스트 작성 (store 순수 로직)**

Create `src/renderer/stores/programs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useProgramsStore } from './programs'
import type { ProgramRuntime } from '../../shared/types'

beforeEach(() => {
  useProgramsStore.setState({ programs: [], runtimes: {} })
})

describe('useProgramsStore.applyRuntime', () => {
  it('stores runtime keyed by programId', () => {
    const rt: ProgramRuntime = { programId: 'a', status: 'running' }
    useProgramsStore.getState().applyRuntime(rt)
    expect(useProgramsStore.getState().runtimes['a'].status).toBe('running')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/renderer/stores/programs.test.ts`
Expected: FAIL ("Cannot find module './programs'").

- [ ] **Step 3: 구현**

Create `src/renderer/lib/ipc.ts`:

```ts
export const ipc = window.api
```

Create `src/renderer/stores/programs.ts`:

```ts
import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Program, ProgramRuntime } from '../../shared/types'

interface ProgramsState {
  programs: Program[]
  runtimes: Record<string, ProgramRuntime>
  load: () => Promise<void>
  applyRuntime: (rt: ProgramRuntime) => void
}

export const useProgramsStore = create<ProgramsState>((set) => ({
  programs: [],
  runtimes: {},
  load: async () => {
    const [programs, runtimeList] = await Promise.all([
      ipc.invoke('programs:list'),
      ipc.invoke('runtime:list')
    ])
    const runtimes: Record<string, ProgramRuntime> = {}
    for (const rt of runtimeList) runtimes[rt.programId] = rt
    set({ programs, runtimes })
  },
  applyRuntime: (rt) => set((s) => ({ runtimes: { ...s.runtimes, [rt.programId]: rt } }))
}))
```

> 테스트 환경에서 `window.api`가 없으므로, `lib/ipc.ts`는 store 파일에서 직접 호출되지 않는 한 평가 시 에러 없음. 위 테스트는 `applyRuntime`만 호출하므로 통과. (load는 통합/실행에서 검증)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/renderer/stores/programs.test.ts`
Expected: PASS.

> 만약 `window` 미정의로 import 단계에서 실패하면, `vitest.config.ts`의 test include에 renderer가 포함되도록 하고 `environment: 'jsdom'`이 필요. 이 경우 `npm install -D jsdom` 후 해당 테스트 파일 상단에 `// @vitest-environment jsdom` 추가.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/ipc.ts src/renderer/stores/programs.ts src/renderer/stores/programs.test.ts
git commit -m "feat: add programs Zustand store and IPC client"
```

---

### Task 15: Renderer 최소 UI (목록·상태·on/off·로그)

**Files:**

- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/features/programs/ProgramList.tsx`
- Create: `src/renderer/features/programs/ProgramRow.tsx`
- Create: `src/renderer/features/logs/LogPanel.tsx`

**Interfaces:**

- Consumes: `useProgramsStore`, `ipc`, 이벤트 구독.
- Produces: 동작하는 최소 화면 — 프로그램 목록, 상태 배지, 시작/정지 버튼, 선택 프로그램의 로그 표시. (스타일은 Tailwind 기본, 폼은 M2)

- [ ] **Step 1: App에서 데이터 로드 + 이벤트 구독**

Replace `src/renderer/App.tsx`:

```tsx
import { useEffect } from 'react'
import { useProgramsStore } from './stores/programs'
import { ipc } from './lib/ipc'
import { ProgramList } from './features/programs/ProgramList'

export default function App() {
  const load = useProgramsStore((s) => s.load)
  const applyRuntime = useProgramsStore((s) => s.applyRuntime)

  useEffect(() => {
    load()
    const off = ipc.on('runtime:changed', applyRuntime)
    return off
  }, [load, applyRuntime])

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900">
      <header className="px-4 py-3 border-b font-semibold">Tool Launcher</header>
      <main className="flex-1 overflow-auto p-4">
        <ProgramList />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: ProgramList**

Create `src/renderer/features/programs/ProgramList.tsx`:

```tsx
import { useProgramsStore } from '../../stores/programs'
import { ProgramRow } from './ProgramRow'

export function ProgramList() {
  const programs = useProgramsStore((s) => s.programs)
  if (programs.length === 0) {
    return <p className="text-gray-500">등록된 프로그램이 없습니다. (추가 폼은 M2)</p>
  }
  return (
    <ul className="space-y-2">
      {programs.map((p) => (
        <ProgramRow key={p.id} program={p} />
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: ProgramRow (상태 배지 + on/off + 로그 토글)**

Create `src/renderer/features/programs/ProgramRow.tsx`:

```tsx
import { useState } from 'react'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'
import { LogPanel } from '../logs/LogPanel'
import type { Program, ProgramStatus } from '../../../shared/types'

const badge: Record<ProgramStatus, string> = {
  stopped: 'bg-gray-300 text-gray-700',
  starting: 'bg-yellow-300 text-yellow-900',
  running: 'bg-green-400 text-green-950',
  error: 'bg-red-400 text-red-950'
}

export function ProgramRow({ program }: { program: Program }) {
  const rt = useProgramsStore((s) => s.runtimes[program.id])
  const status: ProgramStatus = rt?.status ?? 'stopped'
  const [showLog, setShowLog] = useState(false)
  const running = status === 'running' || status === 'starting'

  return (
    <li className="rounded border bg-white p-3">
      <div className="flex items-center gap-3">
        <span className={`rounded px-2 py-0.5 text-xs ${badge[status]}`}>{status}</span>
        <span className="font-medium flex-1">{program.name}</span>
        {rt?.resolvedOpenTarget && (
          <button
            className="text-blue-600 text-sm"
            onClick={() => ipc.invoke('programs:open', program.id)}
          >
            열기
          </button>
        )}
        <button
          className="rounded bg-gray-800 px-3 py-1 text-sm text-white"
          onClick={() => ipc.invoke(running ? 'programs:stop' : 'programs:start', program.id)}
        >
          {running ? '정지' : '시작'}
        </button>
        <button className="text-sm text-gray-600" onClick={() => setShowLog((v) => !v)}>
          로그
        </button>
      </div>
      {showLog && <LogPanel programId={program.id} />}
    </li>
  )
}
```

- [ ] **Step 4: LogPanel (초기 로그 fetch + 실시간 append 구독)**

Create `src/renderer/features/logs/LogPanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { LogLine } from '../../../shared/types'

export function LogPanel({ programId }: { programId: string }) {
  const [lines, setLines] = useState<LogLine[]>([])

  useEffect(() => {
    let active = true
    ipc.invoke('logs:get', programId).then((l) => {
      if (active) setLines(l)
    })
    const off = ipc.on('logs:appended', (batch) => {
      const mine = batch.filter((l) => l.programId === programId)
      if (mine.length) setLines((prev) => [...prev, ...mine])
    })
    return () => {
      active = false
      off()
    }
  }, [programId])

  return (
    <pre className="mt-2 max-h-60 overflow-auto rounded bg-black p-2 text-xs text-green-300">
      {lines.map((l, i) => `${l.processName}| ${l.text}`).join('\n')}
    </pre>
  )
}
```

- [ ] **Step 5: 수동 종단 검증 (임시 프로그램 등록)**

`programs.json`을 직접 만들어 검증한다. 앱을 한 번 실행해 userData 경로를 콘솔로 확인하거나, 다음 위치에 파일 생성:

- macOS: `~/Library/Application Support/<앱이름>/programs.json`

내용(노드 더미 서버 사용):

```json
[
  {
    "id": "demo",
    "name": "Dummy Server",
    "workingDir": ".",
    "processes": [
      {
        "name": "server",
        "command": "node",
        "args": ["src/main/fixtures/dummy-server.cjs"],
        "order": 0
      }
    ]
  }
]
```

Run: `npm run dev`
Expected:

- 목록에 "Dummy Server"가 stopped로 표시.
- "시작" 클릭 → 배지 running, "로그" 클릭 시 `Running on http://127.0.0.1:8888` 출력.
- "정지" 클릭 → stopped로 전환, 프로세스 종료(작업관리자/Activity Monitor로 node 종료 확인).

- [ ] **Step 6: 전체 테스트 + 타입체크**

Run: `npm test && npx tsc --noEmit`
Expected: 모두 통과.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/features
git commit -m "feat: minimal renderer UI for program list, status, start/stop, logs"
```

---

## Self-Review (M1)

**Spec coverage (M1 범위):**

- 등록 프로그램 on/off → Task 6~8, 15 ✓
- 다중 프로세스(순서) → Task 8 ✓
- 상태 표시 → Task 6, 15 ✓
- 로그 보기 → Task 5, 15 ✓
- 데이터 영속(programs.json/settings.json) → Task 4 ✓
- 프로세스 트리 종료 → Task 7, 9 ✓
- 크래시 감지(error) → Task 8 ✓
- IPC 타입 계약 + 보안 경계 → Task 3, 10, 11 ✓
- (M2로 이연) "열기" 동작 실제 resolve, 추가/편집 폼, git, 트레이, 설정 UI
- (M3로 이연) 패키징, CI/CD, lint 경계 강제

**Type consistency:** `ProcessDeps`(spawn/killTree/now/delay), `ChildLike`는 Task 6에서 정의되고 Task 7~9, 10에서 그대로 사용. `IpcApi` 채널명은 Task 3 정의를 Task 10/11/14/15에서 동일하게 사용.

**Placeholder scan:** "열기는 M2", "폼은 M2" 등은 범위 표시이며, M1 태스크 내 코드/명령은 모두 구체적으로 채워짐.

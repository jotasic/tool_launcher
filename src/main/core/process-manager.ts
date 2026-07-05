import type { LogStore } from './log-store'
import type {
  Program,
  ProcessSpec,
  ProgramRuntime,
  ProgramStatus,
  LogLine,
  OpenSpec
} from '../../shared/types'
import { resolveStaticOpen, matchUrlFromLog } from './open-resolver'
import { stripAnsi } from '../../shared/ansi'

export interface ChildLike {
  pid?: number
  stdout: { on(ev: 'data', cb: (chunk: Buffer | string) => void): void } | null
  stderr: { on(ev: 'data', cb: (chunk: Buffer | string) => void): void } | null
  on(ev: 'exit', cb: (code: number | null, signal: string | null) => void): void
  on(ev: 'error', cb: (err: Error) => void): void
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
  delay: (ms: number) => Promise<void>
}

interface RunningProc {
  spec: ProcessSpec
  child: ChildLike
  stopping: boolean
  exited?: boolean
}

interface ProgramState {
  status: ProgramStatus
  error?: string
  resolvedOpenTarget?: string
  procs: RunningProc[]
  open?: OpenSpec
  openDone?: boolean
  /** running이 된 시각 — 업타임 표시 + 자동 재시작 카운터 리셋(min-uptime) 판단 */
  startedAt?: number
  /** 자동 재시작 누적 횟수 (수동 시작 시 0으로) */
  restartCount: number
  /** start/stop마다 증가 — 대기 중인 자동 재시작이 낡았는지 판별 */
  gen: number
}

// PM2의 max-restarts / min-uptime과 같은 개념
const MAX_AUTO_RESTARTS = 5
const STABLE_UPTIME_MS = 60_000

export class ProcessManager {
  private states = new Map<string, ProgramState>()
  private listeners = new Set<(rt: ProgramRuntime) => void>()

  private stopGraceMs: number
  private defaultLogPattern: string
  constructor(
    private logs: LogStore,
    private deps: ProcessDeps,
    opts?: { stopGraceMs?: number; defaultLogPattern?: string }
  ) {
    this.stopGraceMs = opts?.stopGraceMs ?? 5000
    this.defaultLogPattern = opts?.defaultLogPattern ?? 'https?://[^\\s]+'
  }

  getRuntime(programId: string): ProgramRuntime {
    const st = this.states.get(programId)
    return {
      programId,
      status: st?.status ?? 'stopped',
      error: st?.error,
      resolvedOpenTarget: st?.resolvedOpenTarget,
      startedAt: st?.status === 'running' ? st.startedAt : undefined
    }
  }

  onRuntimeChange(cb: (rt: ProgramRuntime) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

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
      for (const raw of lines) {
        // Keep the raw line (renderer renders its ANSI colors); use the
        // stripped text for visibility check and URL detection so color
        // codes can't corrupt the matched URL.
        const clean = stripAnsi(raw)
        if (clean.length > 0) {
          this.log(programId, spec.name, stream, raw)
          this.maybeDetectUrl(programId, spec.name, clean)
        }
      }
    }
    child.stdout?.on('data', onData('stdout'))
    child.stderr?.on('data', onData('stderr'))
  }

  private maybeDetectUrl(programId: string, processName: string, line: string): void {
    const st = this.states.get(programId)
    if (!st || st.open?.mode !== 'url-from-log' || st.resolvedOpenTarget) return
    // When a target process is set, only scan that process's output (so e.g. a
    // backend's URL isn't grabbed when the user wants the frontend's).
    if (st.open.logProcessName && st.open.logProcessName !== processName) return
    const pattern = st.open.logPattern || this.defaultLogPattern
    const found = matchUrlFromLog(line, pattern)
    if (found) {
      this.setStatus(programId, { resolvedOpenTarget: found })
      if (st.open.autoOpenOnStart) this.requestOpen(programId, found)
    }
  }

  async start(program: Program, opts?: { restartCount?: number }): Promise<void> {
    // Never spawn a second copy: ignore double-starts, and when restarting
    // after a crash (status 'error') kill whatever survived from the last run
    // first so processes don't leak as orphans.
    const prev = this.states.get(program.id)
    if (prev && (prev.status === 'starting' || prev.status === 'running')) return
    if (prev && prev.procs.length > 0) await this.stop(program.id)

    const staticTarget = resolveStaticOpen(program.open)
    const st: ProgramState = {
      status: 'starting',
      procs: [],
      open: program.open,
      resolvedOpenTarget: staticTarget,
      restartCount: opts?.restartCount ?? 0,
      gen: (this.states.get(program.id)?.gen ?? prev?.gen ?? 0) + 1
    }
    this.states.set(program.id, st)
    this.setStatus(program.id, {})
    if (staticTarget && program.open?.autoOpenOnStart) {
      this.requestOpen(program.id, staticTarget)
    }

    const ordered = [...program.processes].sort((a, b) => a.order - b.order)
    try {
      for (const spec of ordered) {
        // stop() during a startDelay (or an early crash) flips the status:
        // abort the remaining spawns instead of starting into a dead state.
        if (st.status !== 'starting') return
        const child = this.deps.spawn(spec.command, spec.args ?? [], {
          cwd: spec.cwd ?? program.workingDir,
          env: { ...process.env, ...spec.env },
          detached: process.platform !== 'win32'
        })
        this.pipe(program.id, spec, child)
        const running: RunningProc = { spec, child, stopping: false }
        child.on('exit', (code) => {
          running.exited = true
          if (running.stopping) return
          const reason = `process ${spec.name} exited unexpectedly (code ${code})`
          if (program.autoRestart) void this.scheduleAutoRestart(program, reason)
          else this.setStatus(program.id, { status: 'error', error: reason })
        })
        // spawn failure (e.g. command typo -> ENOENT) emits 'error' and never
        // 'exit' — without this the program would sit in 'starting' forever.
        child.on('error', (err) => {
          running.exited = true
          this.log(program.id, spec.name, 'system', `실행 실패: ${err.message}`)
          this.setStatus(program.id, {
            status: 'error',
            error: `process ${spec.name} failed to start: ${err.message}`
          })
        })
        st.procs.push(running)
        if (spec.startDelayMs && spec.startDelayMs > 0) {
          await this.deps.delay(spec.startDelayMs)
        }
      }
      if (st.status === 'starting') {
        this.setStatus(program.id, { status: 'running', startedAt: this.deps.now() })
      }
    } catch (err) {
      this.setStatus(program.id, { status: 'error', error: (err as Error).message })
    }
  }

  /**
   * 크래시 후 자동 재시작 (PM2 스타일): 지수 백오프(1s→2s→…max 15s), 최대
   * 5회. 60초 이상 안정적으로 돌았다면 새 장애로 보고 카운터를 리셋한다.
   * 대기 중 사용자가 시작/정지를 누르면(gen 변화) 조용히 물러난다.
   */
  private async scheduleAutoRestart(program: Program, reason: string): Promise<void> {
    const st = this.states.get(program.id)
    if (!st || st.status === 'stopped') return
    if (st.startedAt !== undefined && this.deps.now() - st.startedAt >= STABLE_UPTIME_MS) {
      st.restartCount = 0
    }
    if (st.restartCount >= MAX_AUTO_RESTARTS) {
      this.setStatus(program.id, {
        status: 'error',
        error: `${reason} — 자동 재시작 ${MAX_AUTO_RESTARTS}회 초과, 중단`
      })
      return
    }
    st.restartCount++
    const attempt = st.restartCount
    const delayMs = Math.min(1000 * 2 ** (attempt - 1), 15_000)
    this.log(
      program.id,
      'system',
      'system',
      `${reason} — ${delayMs / 1000}초 후 자동 재시작 (${attempt}/${MAX_AUTO_RESTARTS})`
    )
    this.setStatus(program.id, {
      status: 'error',
      error: `자동 재시작 대기 중 (${attempt}/${MAX_AUTO_RESTARTS})`
    })
    const gen = st.gen
    await this.deps.delay(delayMs)
    const cur = this.states.get(program.id)
    if (!cur || cur.gen !== gen || cur.status === 'stopped') return // 수동 조작이 우선
    await this.start(program, { restartCount: attempt })
  }

  /** 정지 후 재시작 (Docker Desktop의 restart 버튼과 동일). */
  async restart(program: Program): Promise<void> {
    await this.stop(program.id)
    await this.start(program)
  }

  async stop(programId: string): Promise<void> {
    const st = this.states.get(programId)
    if (!st || st.status === 'stopped') return
    st.gen++ // 대기 중인 자동 재시작 무효화
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

  /** Stop everything and forget the program — for when it is deleted. */
  async dispose(programId: string): Promise<void> {
    await this.stop(programId)
    this.states.delete(programId)
  }

  private waitExit(rp: RunningProc, ms: number): Promise<boolean> {
    if (rp.exited) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms)
      rp.child.on('exit', () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }
}

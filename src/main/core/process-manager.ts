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
}

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
      resolvedOpenTarget: st?.resolvedOpenTarget
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

  async start(program: Program): Promise<void> {
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
      resolvedOpenTarget: staticTarget
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
          if (!running.stopping) {
            this.setStatus(program.id, {
              status: 'error',
              error: `process ${spec.name} exited unexpectedly (code ${code})`
            })
          }
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
      if (st.status === 'starting') this.setStatus(program.id, { status: 'running' })
    } catch (err) {
      this.setStatus(program.id, { status: 'error', error: (err as Error).message })
    }
  }

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

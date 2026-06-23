import type { LogStore } from './log-store'
import type { Program, ProcessSpec, ProgramRuntime, ProgramStatus, LogLine } from '../../shared/types'

export interface ChildLike {
  pid?: number
  stdout: { on(ev: 'data', cb: (chunk: Buffer | string) => void): void } | null
  stderr: { on(ev: 'data', cb: (chunk: Buffer | string) => void): void } | null
  on(ev: 'exit', cb: (code: number | null, signal: string | null) => void): void
  kill(signal?: string): boolean
}

export interface ProcessDeps {
  spawn: (command: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; detached?: boolean }) => ChildLike
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

  constructor(private logs: LogStore, private deps: ProcessDeps) {}

  getRuntime(programId: string): ProgramRuntime {
    const st = this.states.get(programId)
    return {
      programId,
      status: st?.status ?? 'stopped',
      error: st?.error,
      resolvedOpenTarget: st?.resolvedOpenTarget,
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

  private log(programId: string, processName: string, stream: LogLine['stream'], text: string): void {
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
          detached: process.platform !== 'win32',
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

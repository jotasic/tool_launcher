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
    children[0]!.emitStdout('hello\nworld\n')
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
    children[0]!.emitExit(1, null) // 종료 요청 없이 죽음
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
    children[0]!.emitStdout('Running on http://127.0.0.1:8501\n')
    expect(pm.getRuntime('a').resolvedOpenTarget).toBe('http://127.0.0.1:8501')
  })

  it('fires onOpenRequested once when autoOpenOnStart and target resolves', async () => {
    const { deps, children } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    const opened: string[] = []
    pm.onOpenRequested((_id, target) => opened.push(target))
    await pm.start(prog({ open: { mode: 'url-from-log', autoOpenOnStart: true } }))
    children[0]!.emitStdout('http://127.0.0.1:8501\nhttp://127.0.0.1:9999\n')
    expect(opened).toEqual(['http://127.0.0.1:8501'])
  })
})

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
    expect(killed[0]![1]).toBe('SIGTERM')
    // graceful path: SIGKILL must NOT have fired
    expect(killed).toHaveLength(1)
  })

  it('kills processes in reverse start order', async () => {
    const { deps, children } = makeFakeDeps()
    const killedPids: number[] = []
    deps.killTree = async (pid, sig) => {
      killedPids.push(pid)
      children.find((c) => c.pid === pid)?.emitExit(0, sig)
    }
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 50 })
    await pm.start(
      prog({
        processes: [
          { name: 'first', command: 'node', args: ['first.js'], order: 0 },
          { name: 'second', command: 'node', args: ['second.js'], order: 1 }
        ]
      })
    )
    // children[0] = first-started (order 0), children[1] = second-started (order 1)
    await pm.stop('a')
    expect(killedPids).toHaveLength(2)
    expect(killedPids[0]).toBe(children[1]!.pid) // second-started killed first
    expect(killedPids[1]).toBe(children[0]!.pid) // first-started killed last
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

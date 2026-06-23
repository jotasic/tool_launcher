import { describe, it, expect } from 'vitest'
import { ProcessManager } from './process-manager'
import { LogStore } from './log-store'
import { makeFakeDeps } from './test-helpers'
import type { Program } from '../../shared/types'

const prog = (over: Partial<Program> = {}): Program => ({
  id: 'a', name: 'X', workingDir: '/tmp',
  processes: [{ name: 'p1', command: 'node', args: ['x.js'], order: 0 }],
  ...over,
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
    deps.spawn = () => { throw new Error('ENOENT') }
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(prog())
    expect(pm.getRuntime('a').status).toBe('error')
    expect(pm.getRuntime('a').error).toContain('ENOENT')
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
  })

  it('escalates to SIGKILL if process ignores SIGTERM', async () => {
    const { deps } = makeFakeDeps()
    const signals: string[] = []
    deps.killTree = async (_pid, sig) => { signals.push(sig) } // 절대 exit 안 함
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 20 })
    await pm.start(prog())
    await pm.stop('a')
    expect(signals).toContain('SIGTERM')
    expect(signals).toContain('SIGKILL')
  })
})

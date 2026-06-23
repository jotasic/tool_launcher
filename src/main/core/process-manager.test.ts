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

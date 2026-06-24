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

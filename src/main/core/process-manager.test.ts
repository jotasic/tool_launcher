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

  it('keeps ANSI codes in the log buffer (renderer renders the colors)', async () => {
    const { deps, children } = makeFakeDeps()
    const logs = new LogStore(100)
    const pm = new ProcessManager(logs, deps)
    await pm.start(prog())
    const esc = String.fromCharCode(27)
    children[0]!.emitStdout(`${esc}[32m${esc}[1minfo${esc}[0m ready\n`)
    expect(logs.get('a').map((l) => l.text)).toEqual([`${esc}[32m${esc}[1minfo${esc}[0m ready`])
  })

  it('skips lines that are only escape codes (no visible text)', async () => {
    const { deps, children } = makeFakeDeps()
    const logs = new LogStore(100)
    const pm = new ProcessManager(logs, deps)
    await pm.start(prog())
    const esc = String.fromCharCode(27)
    children[0]!.emitStdout(`${esc}[2K${esc}[0m\n`)
    expect(logs.get('a')).toEqual([])
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

  it("marks error and logs when the child emits 'error' (e.g. command typo)", async () => {
    // ENOENT with shell:false arrives as an async 'error' event and never 'exit' —
    // the program must not sit in starting/running forever.
    const { deps, children } = makeFakeDeps()
    const logs = new LogStore(100)
    const pm = new ProcessManager(logs, deps)
    await pm.start(prog())
    children[0]!.emitError(new Error('spawn pythn ENOENT'))
    expect(pm.getRuntime('a').status).toBe('error')
    expect(pm.getRuntime('a').error).toContain('ENOENT')
    expect(logs.get('a').some((l) => l.stream === 'system' && l.text.includes('ENOENT'))).toBe(true)
  })
})

describe('ProcessManager restart safety', () => {
  it('ignores start while already running (no duplicate spawn)', async () => {
    const { deps, children } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(prog())
    await pm.start(prog())
    expect(children).toHaveLength(1)
    expect(pm.getRuntime('a').status).toBe('running')
  })

  it('kills survivors from a crashed run before restarting', async () => {
    const { deps, children } = makeFakeDeps()
    const killed: number[] = []
    deps.killTree = async (pid, sig) => {
      killed.push(pid)
      children.find((c) => c.pid === pid)?.emitExit(0, sig)
    }
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 20 })
    await pm.start(
      prog({
        processes: [
          { name: 'backend', command: 'b', order: 0 },
          { name: 'frontend', command: 'f', order: 1 }
        ]
      })
    )
    children[0]!.emitExit(1, null) // backend crashes -> status error, frontend alive
    expect(pm.getRuntime('a').status).toBe('error')
    await pm.start(prog({ processes: [{ name: 'p', command: 'x', order: 0 }] }))
    expect(killed).toContain(children[1]!.pid) // survivor was cleaned up
    expect(pm.getRuntime('a').status).toBe('running')
  })

  it('aborts remaining spawns when stopped during a start delay', async () => {
    const { deps, children } = makeFakeDeps()
    deps.killTree = async (pid, sig) => {
      children.find((c) => c.pid === pid)?.emitExit(0, sig)
    }
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 20 })
    deps.delay = async () => {
      await pm.stop('a') // user hits 정지 while proc2 is still waiting to start
    }
    await pm.start(
      prog({
        processes: [
          { name: 'p1', command: 'x', order: 0, startDelayMs: 10 },
          { name: 'p2', command: 'y', order: 1 }
        ]
      })
    )
    expect(children).toHaveLength(1) // p2 was never spawned
    expect(pm.getRuntime('a').status).toBe('stopped')
  })

  it('restart() stops then starts fresh processes', async () => {
    const { deps, children } = makeFakeDeps()
    const killed: number[] = []
    deps.killTree = async (pid, sig) => {
      killed.push(pid)
      children.find((c) => c.pid === pid)?.emitExit(0, sig)
    }
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 20 })
    await pm.start(prog())
    await pm.restart(prog())
    expect(killed).toContain(children[0]!.pid)
    expect(children).toHaveLength(2)
    expect(pm.getRuntime('a').status).toBe('running')
  })

  it('exposes startedAt while running (uptime)', async () => {
    const { deps, children } = makeFakeDeps()
    deps.now = () => 12345
    deps.killTree = async (pid, sig) => {
      children.find((c) => c.pid === pid)?.emitExit(0, sig)
    }
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 20 })
    await pm.start(prog())
    expect(pm.getRuntime('a').startedAt).toBe(12345)
    await pm.stop('a')
    expect(pm.getRuntime('a').startedAt).toBeUndefined()
  })

  it('dispose stops processes and forgets the program', async () => {
    const { deps, children } = makeFakeDeps()
    const killed: number[] = []
    deps.killTree = async (pid, sig) => {
      killed.push(pid)
      children.find((c) => c.pid === pid)?.emitExit(0, sig)
    }
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 20 })
    await pm.start(prog())
    await pm.dispose('a')
    expect(killed).toContain(children[0]!.pid)
    expect(pm.getRuntime('a').status).toBe('stopped')
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

  it('detects a clean url from an ANSI-colored line (codes must not leak in)', async () => {
    const { deps, children } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(prog({ open: { mode: 'url-from-log', autoOpenOnStart: false } }))
    const esc = String.fromCharCode(27)
    children[0]!.emitStdout(`${esc}[32m➜ Local: ${esc}[36mhttp://localhost:5173/${esc}[39m\n`)
    expect(pm.getRuntime('a').resolvedOpenTarget).toBe('http://localhost:5173/')
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

  it('only detects url from the chosen process when logProcessName is set', async () => {
    const { deps, children } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(
      prog({
        processes: [
          { name: 'backend', command: 'b', order: 0 },
          { name: 'frontend', command: 'f', order: 1 }
        ],
        open: { mode: 'url-from-log', logProcessName: 'frontend', autoOpenOnStart: false }
      })
    )
    // children[0] = backend (order 0), children[1] = frontend (order 1)
    children[0]!.emitStdout('Backend on http://localhost:8000\n')
    expect(pm.getRuntime('a').resolvedOpenTarget).toBeUndefined()
    children[1]!.emitStdout('Local: http://localhost:5176\n')
    expect(pm.getRuntime('a').resolvedOpenTarget).toBe('http://localhost:5176')
  })
})

describe('ProcessManager auto-restart', () => {
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
  const auto = (over: Partial<Program> = {}): Program => prog({ autoRestart: true, ...over })

  it('respawns after an unexpected crash', async () => {
    const { deps, children } = makeFakeDeps()
    const logs = new LogStore(100)
    const pm = new ProcessManager(logs, deps)
    await pm.start(auto())
    children[0]!.emitExit(1, null)
    await flush()
    expect(children).toHaveLength(2)
    expect(pm.getRuntime('a').status).toBe('running')
    expect(logs.get('a').some((l) => l.text.includes('자동 재시작'))).toBe(true)
  })

  it('gives up after MAX attempts and reports error', async () => {
    const { deps, children } = makeFakeDeps()
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(auto())
    for (let i = 0; i < 6; i++) {
      children[children.length - 1]!.emitExit(1, null)
      await flush()
    }
    expect(children).toHaveLength(6) // 최초 1 + 재시작 5
    expect(pm.getRuntime('a').status).toBe('error')
    expect(pm.getRuntime('a').error).toContain('5회 초과')
  })

  it('resets the attempt counter after a stable run (min-uptime)', async () => {
    const { deps, children } = makeFakeDeps()
    let t = 0
    deps.now = () => t
    const pm = new ProcessManager(new LogStore(100), deps)
    await pm.start(auto())
    for (let i = 0; i < 5; i++) {
      children[children.length - 1]!.emitExit(1, null)
      await flush()
    }
    expect(children).toHaveLength(6) // 카운터 소진 직전
    t += 120_000 // 이번엔 2분 동안 안정적으로 돌았다
    children[children.length - 1]!.emitExit(1, null)
    await flush()
    expect(children).toHaveLength(7) // 리셋되어 다시 재시작됨
    expect(pm.getRuntime('a').status).toBe('running')
  })

  it('manual stop cancels a pending auto-restart', async () => {
    const { deps, children } = makeFakeDeps()
    let release: (() => void) | null = null
    deps.delay = () => new Promise((r) => (release = () => r()))
    const pm = new ProcessManager(new LogStore(100), deps, { stopGraceMs: 20 })
    await pm.start(auto())
    children[0]!.emitExit(1, null) // 재시작 대기 진입
    await flush()
    await pm.stop('a')
    release!()
    await flush()
    expect(children).toHaveLength(1) // 재스폰 없음
    expect(pm.getRuntime('a').status).toBe('stopped')
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

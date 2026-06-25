import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
    expect(batches[0]!.map((l) => l.text)).toEqual(['1', '2'])
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

describe('LogStore file logging', () => {
  it('writes to <logDir>/<programId>.log when fileLogging is enabled', () => {
    const logDir = mkdtempSync(join(tmpdir(), 'log-store-test-'))
    const s = new LogStore(100, { logDir })
    s.setFileLogging(true)
    s.append({ programId: 'prog1', processName: 'web', stream: 'stdout', text: 'hello', ts: 0 })
    const logFile = join(logDir, 'prog1.log')
    expect(existsSync(logFile)).toBe(true)
    const contents = readFileSync(logFile, 'utf-8')
    expect(contents).toContain('hello')
    expect(contents).toContain('web(stdout)')
  })

  it('does not create a log file when fileLogging is disabled (default)', () => {
    const logDir = mkdtempSync(join(tmpdir(), 'log-store-test-'))
    const s = new LogStore(100, { logDir })
    s.append({ programId: 'prog2', processName: 'web', stream: 'stdout', text: 'world', ts: 0 })
    expect(existsSync(join(logDir, 'prog2.log'))).toBe(false)
  })

  it('stops writing after setFileLogging(false)', () => {
    const logDir = mkdtempSync(join(tmpdir(), 'log-store-test-'))
    const s = new LogStore(100, { logDir })
    s.setFileLogging(true)
    s.append({ programId: 'prog3', processName: 'web', stream: 'stdout', text: 'line1', ts: 0 })
    s.setFileLogging(false)
    s.append({ programId: 'prog3', processName: 'web', stream: 'stdout', text: 'line2', ts: 0 })
    const contents = readFileSync(join(logDir, 'prog3.log'), 'utf-8')
    expect(contents).toContain('line1')
    expect(contents).not.toContain('line2')
  })
})

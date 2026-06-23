import { describe, it, expect } from 'vitest'
import { LogStore } from './log-store'
import type { LogLine } from '../../shared/types'

const line = (programId: string, text: string): LogLine => ({
  programId, processName: 'p', stream: 'stdout', text, ts: 0,
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
    const off = s.subscribe(() => { count++ })
    off()
    s.append(line('a', '1'))
    await Promise.resolve()
    await Promise.resolve()
    expect(count).toBe(0)
  })
})

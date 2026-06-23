import { describe, it, expect } from 'vitest'
import { parseProgram, parseSettings } from './schema'
import { DEFAULT_SETTINGS } from './types'

describe('parseProgram', () => {
  it('accepts a valid minimal program', () => {
    const p = parseProgram({
      id: 'a', name: 'X', workingDir: '/tmp',
      processes: [{ name: 'p1', command: 'echo', order: 0 }],
    })
    expect(p.name).toBe('X')
    expect(p.processes[0].command).toBe('echo')
  })

  it('rejects a program with no processes', () => {
    expect(() => parseProgram({ id: 'a', name: 'X', workingDir: '/tmp', processes: [] }))
      .toThrow()
  })

  it('rejects invalid open mode', () => {
    expect(() => parseProgram({
      id: 'a', name: 'X', workingDir: '/tmp',
      processes: [{ name: 'p1', command: 'echo', order: 0 }],
      open: { mode: 'bogus', autoOpenOnStart: false },
    })).toThrow()
  })
})

describe('parseSettings', () => {
  it('fills defaults for missing fields', () => {
    const s = parseSettings({})
    expect(s).toEqual(DEFAULT_SETTINGS)
  })
})

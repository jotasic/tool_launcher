import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from './store'

let dir: string
let n: number
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tl-')); n = 0 })
const newStore = () => new Store(dir, () => `id-${n++}`)

const sample = {
  name: 'Web', workingDir: '/tmp',
  processes: [{ name: 'p', command: 'echo', order: 0 }],
}

describe('Store', () => {
  it('creates and lists programs with generated ids', () => {
    const s = newStore()
    const p = s.createProgram(sample)
    expect(p.id).toBe('id-0')
    expect(s.listPrograms()).toHaveLength(1)
  })

  it('persists across instances (same baseDir)', () => {
    newStore().createProgram(sample)
    const s2 = new Store(dir, () => 'x')
    expect(s2.listPrograms()).toHaveLength(1)
  })

  it('updates a program', () => {
    const s = newStore()
    const p = s.createProgram(sample)
    s.updateProgram({ ...p, name: 'Renamed' })
    expect(s.listPrograms()[0].name).toBe('Renamed')
  })

  it('deletes a program', () => {
    const s = newStore()
    const p = s.createProgram(sample)
    s.deleteProgram(p.id)
    expect(s.listPrograms()).toHaveLength(0)
  })

  it('returns default settings when none saved', () => {
    expect(newStore().getSettings().logBufferLines).toBeGreaterThan(0)
  })

  it('round-trips export/import', () => {
    const s = newStore()
    s.createProgram(sample)
    const json = s.exportPrograms()
    const s2 = new Store(mkdtempSync(join(tmpdir(), 'tl2-')), () => 'y')
    expect(s2.importPrograms(json)).toHaveLength(1)
  })

  it('rejects invalid program on create', () => {
    expect(() => newStore().createProgram({ ...sample, processes: [] } as any)).toThrow()
  })
})

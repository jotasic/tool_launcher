import { describe, it, expect } from 'vitest'
import { stripAnsi, parseAnsi } from './ansi'

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

describe('stripAnsi', () => {
  it('strips SGR color/style codes', () => {
    const input = `${ESC}[2m2026-06-25T10:01:40Z${ESC}[0m [${ESC}[32m${ESC}[1minfo${ESC}[0m]`
    expect(stripAnsi(input)).toBe('2026-06-25T10:01:40Z [info]')
  })

  it('leaves plain text unchanged', () => {
    expect(stripAnsi('Running on http://localhost:5176')).toBe('Running on http://localhost:5176')
  })

  it('extracts a clean URL from a colored line', () => {
    expect(stripAnsi(`${ESC}[32mhttp://localhost:5176${ESC}[0m`)).toBe('http://localhost:5176')
  })

  it('strips OSC hyperlink sequences', () => {
    const input = `${ESC}]8;;http://localhost:5173${BEL}Local${ESC}]8;;${BEL} ready`
    expect(stripAnsi(input)).toBe('Local ready')
  })
})

describe('parseAnsi', () => {
  it('returns one default segment for plain text', () => {
    expect(parseAnsi('hello')).toEqual([
      { text: 'hello', color: undefined, bold: false, dim: false, underline: false }
    ])
  })

  it('colors 16-color SGR and resets on 0', () => {
    const segs = parseAnsi(`${ESC}[32mok${ESC}[0m rest`)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ text: 'ok', color: '#0dbc79' })
    expect(segs[1]).toMatchObject({ text: ' rest', color: undefined })
  })

  it('maps bold + basic color to the bright variant', () => {
    const segs = parseAnsi(`${ESC}[1;31mFAIL${ESC}[22m warn`)
    expect(segs[0]).toMatchObject({ text: 'FAIL', color: '#f14c4c', bold: true })
    expect(segs[1]).toMatchObject({ text: ' warn', color: '#cd3131', bold: false })
  })

  it('supports 256-color and truecolor foregrounds', () => {
    const segs = parseAnsi(`${ESC}[38;5;196mred${ESC}[38;2;10;20;30mrgb${ESC}[39mdefault`)
    expect(segs[0]!.color).toBe('rgb(255,0,0)')
    expect(segs[1]!.color).toBe('rgb(10,20,30)')
    expect(segs[2]!.color).toBeUndefined()
  })

  it('ignores background codes without corrupting following params', () => {
    const segs = parseAnsi(`${ESC}[41;32mgreen-on-red${ESC}[0m`)
    expect(segs[0]).toMatchObject({ text: 'green-on-red', color: '#0dbc79' })
  })

  it('discards non-SGR sequences (cursor moves, OSC)', () => {
    const segs = parseAnsi(`${ESC}[2Kcleared ${ESC}]8;;x${BEL}link${ESC}]8;;${BEL}`)
    expect(segs.map((s) => s.text).join('')).toBe('cleared link')
  })
})

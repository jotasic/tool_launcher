import { describe, it, expect } from 'vitest'
import { stripAnsi } from './ansi'

const ESC = String.fromCharCode(27)

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
})

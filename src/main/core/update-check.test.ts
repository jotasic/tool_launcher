import { describe, it, expect } from 'vitest'
import { compareVersions } from './update-check'

describe('compareVersions', () => {
  it('compares semver numerically, not lexically', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
  })

  it('handles v prefix and equality', () => {
    expect(compareVersions('v0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('v0.2.0', 'v0.1.9')).toBeGreaterThan(0)
  })

  it('older version compares negative', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0)
  })

  it('tolerates missing/garbage parts as 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.x.0', '1.0.0')).toBe(0)
  })
})

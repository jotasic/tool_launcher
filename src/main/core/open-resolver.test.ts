import { describe, it, expect } from 'vitest'
import { resolveStaticOpen, matchUrlFromLog } from './open-resolver'

describe('resolveStaticOpen', () => {
  it('returns value for url mode', () => {
    expect(resolveStaticOpen({ mode: 'url', value: 'http://x', autoOpenOnStart: false })).toBe('http://x')
  })
  it('returns value for path mode', () => {
    expect(resolveStaticOpen({ mode: 'path', value: '/tmp/a', autoOpenOnStart: false })).toBe('/tmp/a')
  })
  it('returns undefined for none and url-from-log', () => {
    expect(resolveStaticOpen({ mode: 'none', autoOpenOnStart: false })).toBeUndefined()
    expect(resolveStaticOpen({ mode: 'url-from-log', logPattern: 'x', autoOpenOnStart: false })).toBeUndefined()
  })
  it('returns undefined when open is undefined', () => {
    expect(resolveStaticOpen(undefined)).toBeUndefined()
  })
})

describe('matchUrlFromLog', () => {
  it('extracts first url-like match', () => {
    expect(matchUrlFromLog('Running on http://127.0.0.1:8501 (Press Ctrl+C)', 'https?://[^\\s]+'))
      .toBe('http://127.0.0.1:8501')
  })
  it('returns undefined when no match', () => {
    expect(matchUrlFromLog('no url here', 'https?://[^\\s]+')).toBeUndefined()
  })
  it('returns undefined for invalid regex', () => {
    expect(matchUrlFromLog('http://x', '(')).toBeUndefined()
  })
})

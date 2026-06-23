import type { OpenSpec } from '../../shared/types'

export function resolveStaticOpen(open: OpenSpec | undefined): string | undefined {
  if (!open) return undefined
  if (open.mode === 'url' || open.mode === 'path') {
    return open.value && open.value.length > 0 ? open.value : undefined
  }
  return undefined
}

export function matchUrlFromLog(text: string, pattern: string): string | undefined {
  try {
    const re = new RegExp(pattern)
    const m = re.exec(text)
    return m ? m[0] : undefined
  } catch {
    return undefined
  }
}

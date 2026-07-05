import type { UpdateInfo } from '../../shared/types'

// 이 앱 자신의 저장소 — 태그 기반 릴리즈에서 최신 버전을 조회한다.
const REPO = 'jotasic/tool_launcher'

/** 'v' 접두어를 떼고 semver 세 자리를 숫자로 비교. a > b 이면 양수. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * GitHub 최신 릴리즈와 현재 버전 비교. 네트워크 실패는 조용히 null —
 * 업데이트 확인은 부가 기능이라 앱 동작을 방해하면 안 된다.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'tool-launcher', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const latest = (data.tag_name ?? '').replace(/^v/, '')
    if (!latest) return null
    return {
      current: currentVersion,
      latest,
      url: data.html_url ?? `https://github.com/${REPO}/releases/latest`,
      hasUpdate: compareVersions(latest, currentVersion) > 0
    }
  } catch {
    return null
  }
}

import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settings'

/** settings.theme을 documentElement의 'dark' 클래스에 동기화한다. */
export function useTheme(): void {
  const theme = useSettingsStore((s) => s.settings?.theme ?? 'system')

  useEffect(() => {
    const root = document.documentElement

    if (theme === 'dark') {
      root.classList.add('dark')
      return
    }
    if (theme === 'light') {
      root.classList.remove('dark')
      return
    }

    // system: 현재 값 적용 + 변경 실시간 추적
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (matches: boolean): void => {
      root.classList.toggle('dark', matches)
    }
    apply(mql.matches)
    const onChange = (e: MediaQueryListEvent): void => apply(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [theme])
}

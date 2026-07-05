import { useEffect, useState } from 'react'
import { useProgramsStore } from './stores/programs'
import { useSettingsStore } from './stores/settings'
import { ipc } from './lib/ipc'
import { ProgramList } from './features/programs/ProgramList'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { Button } from '@/components/ui/button'
import { useTheme } from './lib/use-theme'
import type { UpdateInfo } from '../../shared/types'

export default function App() {
  const load = useProgramsStore((s) => s.load)
  const applyRuntime = useProgramsStore((s) => s.applyRuntime)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useTheme()

  useEffect(() => {
    load()
    void useSettingsStore.getState().load()
    // 새 릴리즈 확인 (실패하면 조용히 무시)
    void ipc.invoke('update:check').then((u) => {
      if (u?.hasUpdate) setUpdate(u)
    })
    const off = ipc.on('runtime:changed', applyRuntime)
    return off
  }, [load, applyRuntime])

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="px-4 py-3 border-b font-semibold flex items-center justify-between">
        <span>Tool Launcher</span>
        <div className="flex items-center gap-2">
          {update && (
            <Button
              variant="outline"
              size="sm"
              className="text-green-600 dark:text-green-400"
              title={`현재 v${update.current} → 최신 v${update.latest}`}
              onClick={() => ipc.invoke('update:openDownload', update.url)}
            >
              ⬆ v{update.latest} 업데이트
            </Button>
          )}
          <SettingsDialog
            trigger={
              <Button variant="outline" size="sm">
                설정
              </Button>
            }
          />
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4">
        <ProgramList />
      </main>
    </div>
  )
}

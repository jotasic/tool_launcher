import { useEffect } from 'react'
import { useProgramsStore } from './stores/programs'
import { useSettingsStore } from './stores/settings'
import { ipc } from './lib/ipc'
import { ProgramList } from './features/programs/ProgramList'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { Button } from '@/components/ui/button'
import { useTheme } from './lib/use-theme'

export default function App() {
  const load = useProgramsStore((s) => s.load)
  const applyRuntime = useProgramsStore((s) => s.applyRuntime)

  useTheme()

  useEffect(() => {
    load()
    void useSettingsStore.getState().load()
    const off = ipc.on('runtime:changed', applyRuntime)
    return off
  }, [load, applyRuntime])

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="px-4 py-3 border-b font-semibold flex items-center justify-between">
        <span>Tool Launcher</span>
        <SettingsDialog
          trigger={
            <Button variant="outline" size="sm">
              설정
            </Button>
          }
        />
      </header>
      <main className="flex-1 overflow-auto p-4">
        <ProgramList />
      </main>
    </div>
  )
}

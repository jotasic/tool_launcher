import { useEffect } from 'react'
import { useProgramsStore } from './stores/programs'
import { ipc } from './lib/ipc'
import { ProgramList } from './features/programs/ProgramList'

export default function App() {
  const load = useProgramsStore((s) => s.load)
  const applyRuntime = useProgramsStore((s) => s.applyRuntime)

  useEffect(() => {
    load()
    const off = ipc.on('runtime:changed', applyRuntime)
    return off
  }, [load, applyRuntime])

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900">
      <header className="px-4 py-3 border-b font-semibold">Tool Launcher</header>
      <main className="flex-1 overflow-auto p-4">
        <ProgramList />
      </main>
    </div>
  )
}

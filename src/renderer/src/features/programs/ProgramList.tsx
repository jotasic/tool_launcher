import { useState } from 'react'
import { useProgramsStore } from '../../stores/programs'
import { ProgramRow } from './ProgramRow'
import { ProgramForm } from './ProgramForm'
import { Button } from '@/components/ui/button'
import { ipc } from '../../lib/ipc'

export function ProgramList() {
  const programs = useProgramsStore((s) => s.programs)
  const runtimes = useProgramsStore((s) => s.runtimes)
  const [busy, setBusy] = useState(false)

  const runningCount = programs.filter((p) => {
    const status = runtimes[p.id]?.status ?? 'stopped'
    return status === 'running' || status === 'starting'
  }).length

  const startAll = async () => {
    if (busy) return
    setBusy(true)
    try {
      for (const p of programs) {
        const status = runtimes[p.id]?.status ?? 'stopped'
        if (status === 'stopped' || status === 'error') {
          await ipc.invoke('programs:start', p.id)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const stopAll = async () => {
    if (busy) return
    setBusy(true)
    try {
      for (const p of programs) {
        const status = runtimes[p.id]?.status ?? 'stopped'
        if (status === 'running' || status === 'starting') {
          await ipc.invoke('programs:stop', p.id)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <ProgramForm trigger={<Button>+ 프로그램 추가</Button>} />
        <div className="ml-auto flex items-center gap-2">
          {programs.length > 0 && (
            <span className="text-xs text-muted-foreground">
              실행 중 {runningCount}/{programs.length}
            </span>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={startAll}>
            전체 시작
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={stopAll}>
            전체 정지
          </Button>
        </div>
      </div>
      {programs.length === 0 ? (
        <p className="text-muted-foreground">등록된 프로그램이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {programs.map((p) => (
            <ProgramRow key={p.id} program={p} />
          ))}
        </ul>
      )}
    </div>
  )
}

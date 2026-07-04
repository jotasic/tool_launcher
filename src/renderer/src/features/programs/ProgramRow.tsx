import { useEffect, useRef, useState } from 'react'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'
import { LogPanel } from '../logs/LogPanel'
import { ProgramForm } from './ProgramForm'
import { Button } from '@/components/ui/button'
import type { Program, ProgramStatus } from '../../../../shared/types'

const statusLabel: Record<ProgramStatus, string> = {
  stopped: '정지됨',
  starting: '시작 중',
  running: '실행 중',
  error: '오류'
}

const badge: Record<ProgramStatus, string> = {
  stopped: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  starting: 'bg-yellow-100 text-yellow-800 animate-pulse dark:bg-yellow-900 dark:text-yellow-200',
  running: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
}

// 삭제 확인 유예 시간: 이 시간 안에 재클릭하지 않으면 원래 버튼으로 되돌린다.
const DELETE_CONFIRM_MS = 3000

export function ProgramRow({ program }: { program: Program }) {
  const rt = useProgramsStore((s) => s.runtimes[program.id])
  const status: ProgramStatus = rt?.status ?? 'stopped'
  const [showLog, setShowLog] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const running = status === 'running' || status === 'starting'

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  const handleDeleteClick = (): void => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), DELETE_CONFIRM_MS)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmDelete(false)
    void useProgramsStore.getState().remove(program.id)
  }

  return (
    <li className="rounded border bg-card text-card-foreground p-3">
      <div className="flex items-center gap-3">
        <span className={`rounded px-2 py-0.5 text-xs ${badge[status]}`}>
          {statusLabel[status]}
        </span>
        <span className="font-medium flex-1">{program.name}</span>
        {rt?.resolvedOpenTarget && (
          <Button variant="link" size="sm" onClick={() => ipc.invoke('programs:open', program.id)}>
            열기
          </Button>
        )}
        <Button
          size="sm"
          disabled={status === 'starting'}
          onClick={() => ipc.invoke(running ? 'programs:stop' : 'programs:start', program.id)}
        >
          {status === 'starting' ? '시작 중...' : running ? '정지' : '시작'}
        </Button>
        <Button
          variant={showLog ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowLog((v) => !v)}
        >
          로그
        </Button>
        <ProgramForm
          existing={program}
          trigger={
            <Button variant="ghost" size="sm">
              편집
            </Button>
          }
        />
        <Button
          variant={confirmDelete ? 'destructive' : 'ghost'}
          size="sm"
          className={confirmDelete ? undefined : 'text-destructive hover:text-destructive'}
          disabled={running}
          title={running ? '먼저 정지하세요' : undefined}
          onClick={handleDeleteClick}
        >
          {confirmDelete ? '정말 삭제?' : '삭제'}
        </Button>
      </div>
      {status === 'error' && rt?.error && (
        <p className="mt-1 text-xs text-destructive">{rt.error}</p>
      )}
      {showLog && <LogPanel programId={program.id} onCollapse={() => setShowLog(false)} />}
    </li>
  )
}

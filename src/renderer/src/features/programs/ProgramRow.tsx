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

// 업타임 표시 갱신 주기.
const UPTIME_REFRESH_MS = 30000

function formatUptime(startedAt: number, now: number): string {
  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (elapsedSec < 60) return `${elapsedSec}초`
  const elapsedMin = Math.floor(elapsedSec / 60)
  if (elapsedMin < 60) return `${elapsedMin}분`
  const elapsedHour = Math.floor(elapsedMin / 60)
  if (elapsedHour < 24) {
    const remMin = elapsedMin % 60
    return `${elapsedHour}시간 ${remMin}분`
  }
  const elapsedDay = Math.floor(elapsedHour / 24)
  return `${elapsedDay}일`
}

// startedAt을 key로 사용해 마운트하면, 프로그램이 (재)시작될 때마다 컴포넌트가 새로
// 마운트되어 `now`가 항상 최신 시각에서 출발한다 (effect 안에서의 동기 setState 없이).
function Uptime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), UPTIME_REFRESH_MS)
    return () => clearInterval(id)
  }, [])
  return <span className="text-xs text-muted-foreground">{formatUptime(startedAt, now)}</span>
}

export function ProgramRow({ program }: { program: Program }) {
  const rt = useProgramsStore((s) => s.runtimes[program.id])
  const status: ProgramStatus = rt?.status ?? 'stopped'
  const [showLog, setShowLog] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const running = status === 'running' || status === 'starting'
  const startedAt = rt?.startedAt

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
        <div className="flex items-center gap-1.5">
          <span className={`rounded px-2 py-0.5 text-xs ${badge[status]}`}>
            {statusLabel[status]}
          </span>
          {status === 'running' && startedAt && <Uptime key={startedAt} startedAt={startedAt} />}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="font-medium truncate">{program.name}</span>
          {rt?.resolvedOpenTarget && /^https?:\/\//.test(rt.resolvedOpenTarget) && (
            <span className="text-xs text-muted-foreground truncate">{rt.resolvedOpenTarget}</span>
          )}
        </div>
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
        {status !== 'stopped' && (
          <Button
            variant="outline"
            size="sm"
            disabled={status === 'starting'}
            onClick={() => ipc.invoke('programs:restart', program.id)}
          >
            재시작
          </Button>
        )}
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

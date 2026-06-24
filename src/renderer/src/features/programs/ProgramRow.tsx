import { useState } from 'react'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'
import { LogPanel } from '../logs/LogPanel'
import { ProgramForm } from './ProgramForm'
import type { Program, ProgramStatus } from '../../../../shared/types'

const badge: Record<ProgramStatus, string> = {
  stopped: 'bg-gray-300 text-gray-700',
  starting: 'bg-yellow-300 text-yellow-900',
  running: 'bg-green-400 text-green-950',
  error: 'bg-red-400 text-red-950'
}

export function ProgramRow({ program }: { program: Program }) {
  const rt = useProgramsStore((s) => s.runtimes[program.id])
  const status: ProgramStatus = rt?.status ?? 'stopped'
  const [showLog, setShowLog] = useState(false)
  const running = status === 'running' || status === 'starting'

  return (
    <li className="rounded border bg-white p-3">
      <div className="flex items-center gap-3">
        <span className={`rounded px-2 py-0.5 text-xs ${badge[status]}`}>{status}</span>
        <span className="font-medium flex-1">{program.name}</span>
        {rt?.resolvedOpenTarget && (
          <button
            className="text-blue-600 text-sm"
            onClick={() => ipc.invoke('programs:open', program.id)}
          >
            열기
          </button>
        )}
        <button
          className="rounded bg-gray-800 px-3 py-1 text-sm text-white"
          onClick={() => ipc.invoke(running ? 'programs:stop' : 'programs:start', program.id)}
        >
          {running ? '정지' : '시작'}
        </button>
        <button className="text-sm text-gray-600" onClick={() => setShowLog((v) => !v)}>
          로그
        </button>
        <ProgramForm
          existing={program}
          trigger={<button className="text-sm text-gray-600">편집</button>}
        />
        <button
          className="text-sm text-red-600"
          onClick={() => useProgramsStore.getState().remove(program.id)}
        >
          삭제
        </button>
      </div>
      {showLog && <LogPanel programId={program.id} />}
    </li>
  )
}

import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { LogLine } from '../../../../shared/types'

export function LogPanel({ programId }: { programId: string }) {
  const [lines, setLines] = useState<LogLine[]>([])

  useEffect(() => {
    let active = true
    ipc.invoke('logs:get', programId).then((l) => {
      if (active) setLines(l)
    })
    const off = ipc.on('logs:appended', (batch) => {
      const mine = batch.filter((l) => l.programId === programId)
      if (mine.length) setLines((prev) => [...prev, ...mine])
    })
    return () => {
      active = false
      off()
    }
  }, [programId])

  return (
    <pre className="mt-2 max-h-60 overflow-auto rounded bg-black p-2 text-xs text-green-300">
      {lines.map((l) => `${l.processName}| ${l.text}`).join('\n')}
    </pre>
  )
}

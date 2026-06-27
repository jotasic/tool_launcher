import { useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { LogLine } from '../../../../shared/types'

export function LogPanel({ programId }: { programId: string }): React.JSX.Element {
  const [lines, setLines] = useState<LogLine[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  useEffect(() => {
    let active = true
    ipc.invoke('logs:get', programId).then((l) => {
      if (active) setLines(l ?? [])
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

  // Auto-scroll to the bottom on new lines — but only if the user was already
  // near the bottom (so scrolling up to read isn't yanked back down).
  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const asText = (): string => lines.map((l) => `${l.processName}| ${l.text}`).join('\n')

  const clear = async (): Promise<void> => {
    await ipc.invoke('logs:clear', programId)
    setLines([])
  }

  const copy = (): void => {
    void navigator.clipboard.writeText(asText())
  }

  const scrollToBottom = (): void => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      atBottomRef.current = true
    }
  }

  return (
    <div className="mt-2 overflow-hidden rounded border">
      <div className="flex items-center justify-between border-b bg-gray-50 px-2 py-1 text-xs">
        <span className="text-gray-500">{lines.length} 줄</span>
        <div className="flex gap-1">
          <button className="rounded px-2 py-0.5 hover:bg-gray-200" onClick={scrollToBottom}>
            맨아래
          </button>
          <button className="rounded px-2 py-0.5 hover:bg-gray-200" onClick={copy}>
            복사
          </button>
          <button className="rounded px-2 py-0.5 text-red-600 hover:bg-gray-200" onClick={clear}>
            지우기
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-80 min-h-32 resize-y overflow-auto bg-black p-2 font-mono text-xs leading-relaxed text-green-300"
      >
        {lines.length === 0 ? (
          <span className="text-gray-500">(로그 없음)</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              <span className="text-gray-500">{l.processName}| </span>
              {l.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

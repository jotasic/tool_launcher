import { memo, useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { parseAnsi, stripAnsi, type AnsiSegment } from '../../../../shared/ansi'
import type { LogLine } from '../../../../shared/types'

// Cap how many lines we keep in the view so a chatty program can't grow the
// DOM unbounded and cause jank (full history still lives in the log file).
const MAX = 2000

// Parse each line's ANSI codes once (keyed by line object), not on every render.
const segCache = new WeakMap<LogLine, AnsiSegment[]>()
function segmentsOf(line: LogLine): AnsiSegment[] {
  let segs = segCache.get(line)
  if (!segs) {
    segs = parseAnsi(line.text)
    segCache.set(line, segs)
  }
  return segs
}

function styleOf(s: AnsiSegment): React.CSSProperties | undefined {
  if (!s.color && !s.bold && !s.dim && !s.underline) return undefined
  return {
    color: s.color,
    fontWeight: s.bold ? 600 : undefined,
    opacity: s.dim ? 0.65 : undefined,
    textDecoration: s.underline ? 'underline' : undefined
  }
}

// memo: appended batches leave existing line objects untouched, so earlier
// rows skip re-rendering — only new lines mount.
const Line = memo(function Line({ line }: { line: LogLine }): React.JSX.Element {
  return (
    <span>
      <span className="text-zinc-500">{line.processName}| </span>
      {segmentsOf(line).map((s, j) => (
        <span key={j} style={styleOf(s)}>
          {s.text}
        </span>
      ))}
      {'\n'}
    </span>
  )
})

export function LogPanel({ programId }: { programId: string }): React.JSX.Element {
  const [lines, setLines] = useState<LogLine[]>([])
  const [atBottom, setAtBottom] = useState(true)
  const preRef = useRef<HTMLPreElement>(null)
  const atBottomRef = useRef(true)
  const pendingRef = useRef<LogLine[]>([])
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    ipc.invoke('logs:get', programId).then((l) => {
      if (active) setLines((l ?? []).slice(-MAX))
    })

    // Coalesce incoming batches into one render per animation frame so a fast
    // log stream doesn't trigger a re-render per line.
    const flush = (): void => {
      rafRef.current = null
      if (pendingRef.current.length === 0) return
      const inc = pendingRef.current
      pendingRef.current = []
      setLines((prev) => {
        const next = prev.concat(inc)
        return next.length > MAX ? next.slice(next.length - MAX) : next
      })
    }
    const off = ipc.on('logs:appended', (batch) => {
      const mine = batch.filter((l) => l.programId === programId)
      if (mine.length === 0) return
      pendingRef.current.push(...mine)
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush)
    })

    return () => {
      active = false
      off()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [programId])

  // Follow the tail: on new content scroll to bottom — unless the user scrolled
  // up to read (then we pause until they return to the bottom).
  useEffect(() => {
    const el = preRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const onScroll = (): void => {
    const el = preRef.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    atBottomRef.current = bottom
    setAtBottom(bottom)
  }

  const jumpToBottom = (): void => {
    const el = preRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    atBottomRef.current = true
    setAtBottom(true)
  }

  const clear = async (): Promise<void> => {
    await ipc.invoke('logs:clear', programId)
    setLines([])
  }

  const copy = (): void => {
    // copy plain text — escape codes are display-only
    const text = lines.map((l) => `${l.processName}| ${stripAnsi(l.text)}`).join('\n')
    void navigator.clipboard.writeText(text)
  }

  return (
    <div className="relative mt-2 overflow-hidden rounded border">
      <div className="flex items-center justify-between border-b bg-muted/50 px-2 py-1 text-xs">
        <span className="text-muted-foreground">
          {lines.length} 줄{!atBottom && ' · ⏸ 스크롤 중(자동정지)'}
        </span>
        <div className="flex gap-1">
          <button className="rounded px-2 py-0.5 hover:bg-accent" onClick={copy}>
            복사
          </button>
          <button className="rounded px-2 py-0.5 text-destructive hover:bg-accent" onClick={clear}>
            지우기
          </button>
        </div>
      </div>
      <pre
        ref={preRef}
        onScroll={onScroll}
        className="m-0 h-[max(28rem,70vh)] min-h-32 resize-y overflow-auto whitespace-pre-wrap break-all bg-black p-2 font-mono text-xs leading-relaxed text-[#cccccc]"
      >
        {lines.length === 0 ? '(로그 없음)' : lines.map((l, i) => <Line key={i} line={l} />)}
      </pre>
      {!atBottom && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-3 right-4 rounded-full bg-gray-800/90 px-3 py-1 text-xs text-white shadow hover:bg-gray-700"
        >
          ↓ 최신 로그
        </button>
      )}
    </div>
  )
}

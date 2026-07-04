import { memo } from 'react'
import type { LogLine } from '../../../../shared/types'
import { segmentsOf, withHighlights, styleOf, fmtTime, type Piece } from './log-utils'

// memo: 스트리밍 append 시 기존 LogLine 객체는 그대로라 이전 줄들은 리렌더를
// 건너뛴다 (검색 중 매치된 줄만 ranges가 새로 내려와 다시 그림).
export const Line = memo(function Line({
  line,
  count,
  showTime,
  ranges,
  active
}: {
  line: LogLine
  count: number
  showTime: boolean
  ranges?: Array<[number, number]>
  active?: boolean
}): React.JSX.Element {
  const pieces: Piece[] = ranges?.length
    ? withHighlights(segmentsOf(line), ranges)
    : segmentsOf(line)
  return (
    <span data-match-active={active || undefined} className={active ? 'bg-white/10' : undefined}>
      {showTime && <span className="text-zinc-600">{fmtTime(line.ts)} </span>}
      <span className="text-zinc-500">{line.processName}| </span>
      {pieces.map((s, j) => (
        <span
          key={j}
          style={styleOf(s)}
          className={s.hl ? (active ? 'bg-orange-400 text-black' : 'bg-yellow-500/40') : undefined}
        >
          {s.text}
        </span>
      ))}
      {count > 1 && (
        <span className="ml-1 rounded bg-zinc-700 px-1 text-[10px] text-zinc-300">×{count}</span>
      )}
      {'\n'}
    </span>
  )
})

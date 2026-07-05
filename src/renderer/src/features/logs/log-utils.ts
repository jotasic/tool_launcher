import { parseAnsi, stripAnsi, type AnsiSegment } from '../../../../shared/ansi'
import type { LogLine } from '../../../../shared/types'

// Parse each line's ANSI codes / stripped text once (keyed by line object).
const segCache = new WeakMap<LogLine, AnsiSegment[]>()
export function segmentsOf(line: LogLine): AnsiSegment[] {
  let segs = segCache.get(line)
  if (!segs) {
    segs = parseAnsi(line.text)
    segCache.set(line, segs)
  }
  return segs
}

const textCache = new WeakMap<LogLine, string>()
export function textOf(line: LogLine): string {
  let t = textCache.get(line)
  if (t === undefined) {
    t = stripAnsi(line.text)
    textCache.set(line, t)
  }
  return t
}

/** 대소문자 무시 검색어의 모든 등장 위치 (query는 소문자로 전달). */
export function findRanges(text: string, query: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const hay = text.toLowerCase()
  let from = 0
  while (true) {
    const i = hay.indexOf(query, from)
    if (i === -1) break
    ranges.push([i, i + query.length])
    from = i + query.length
  }
  return ranges
}

/** 정규식 검색의 모든 등장 위치 (re는 g 플래그 필수). 빈 매치는 건너뜀. */
export function findRangesRegex(text: string, re: RegExp): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[0].length === 0) {
      re.lastIndex++ // 빈 매치(a* 등)로 무한루프 방지
      continue
    }
    ranges.push([m.index, m.index + m[0].length])
    if (ranges.length >= 200) break
  }
  return ranges
}

export type LogLevel = 'error' | 'warn' | null

// 흔한 로거 표기(uvicorn/pino/log4j/파이썬 traceback 등)에서 레벨 추정
const ERROR_RE = /(^|[^A-Za-z])(ERROR|ERR!?|FATAL|CRITICAL|EXCEPTION|TRACEBACK|PANIC)([^A-Za-z]|$)/i
const WARN_RE = /(^|[^A-Za-z])(WARN|WARNING)([^A-Za-z]|$)/i

const levelCache = new WeakMap<LogLine, LogLevel>()
export function levelOf(line: LogLine): LogLevel {
  let lv = levelCache.get(line)
  if (lv === undefined) {
    const t = textOf(line)
    lv = ERROR_RE.test(t) ? 'error' : WARN_RE.test(t) ? 'warn' : null
    levelCache.set(line, lv)
  }
  return lv
}

export type Piece = AnsiSegment & { hl?: boolean }

// 검색 매치 구간(ranges, stripped 텍스트 기준 인덱스)에 걸치는 세그먼트를
// 잘라 hl 표시를 붙인다. 세그먼트 텍스트를 이어붙인 것 = stripped 텍스트.
export function withHighlights(segs: AnsiSegment[], ranges: Array<[number, number]>): Piece[] {
  const total = segs.reduce((n, s) => n + s.text.length, 0)
  const mask = new Uint8Array(total)
  for (const [s, e] of ranges) mask.fill(1, s, Math.min(e, total))
  const out: Piece[] = []
  let pos = 0
  for (const seg of segs) {
    const t = seg.text
    let runStart = 0
    for (let i = 1; i <= t.length; i++) {
      if (i === t.length || mask[pos + i] !== mask[pos + runStart]) {
        out.push({ ...seg, text: t.slice(runStart, i), hl: mask[pos + runStart] === 1 })
        runStart = i
      }
    }
    pos += t.length
  }
  return out
}

export function styleOf(s: AnsiSegment): React.CSSProperties | undefined {
  if (!s.color && !s.bold && !s.dim && !s.underline) return undefined
  return {
    color: s.color,
    fontWeight: s.bold ? 600 : undefined,
    opacity: s.dim ? 0.65 : undefined,
    textDecoration: s.underline ? 'underline' : undefined
  }
}

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 연속 중복 접기 후의 표시 단위. */
export interface DisplayLine {
  line: LogLine
  count: number
}

// ANSI escape handling shared by main (strip for URL detection / file logs)
// and renderer (parse SGR color codes into styled segments for display).

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

// Matches one escape sequence: SGR (params captured), any other CSI, or OSC.
// Built via constructor so the control chars stay out of a literal regex.
function ansiRe(): RegExp {
  return new RegExp(
    ESC +
      '(?:' +
      '\\[([0-9;]*)m' + // SGR — the only sequence we interpret
      '|\\[[0-9;?]*[ -/]*[@-~]' + // other CSI (cursor moves 등) — discard
      '|\\][^' +
      BEL +
      ESC +
      ']*(?:' +
      BEL +
      '|' +
      ESC +
      '\\\\)?' + // OSC (하이퍼링크 등) — discard
      ')',
    'g'
  )
}

/** 이스케이프 시퀀스를 모두 제거한 순수 텍스트 (URL 탐지·파일 저장·복사용). */
export function stripAnsi(text: string): string {
  return text.replace(ansiRe(), '')
}

export interface AnsiSegment {
  text: string
  /** CSS color; undefined = 터미널 기본색 */
  color?: string
  bold?: boolean
  dim?: boolean
  underline?: boolean
}

// VS Code dark terminal palette
const BASIC = [
  '#000000',
  '#cd3131',
  '#0dbc79',
  '#e5e510',
  '#2472c8',
  '#bc3fbc',
  '#11a8cd',
  '#e5e5e5'
]
const BRIGHT = [
  '#666666',
  '#f14c4c',
  '#23d18b',
  '#f5f543',
  '#3b8eea',
  '#d670d6',
  '#29b8db',
  '#ffffff'
]

function color256(n: number): string | undefined {
  if (n < 0 || n > 255 || Number.isNaN(n)) return undefined
  if (n < 8) return BASIC[n]
  if (n < 16) return BRIGHT[n - 8]
  if (n < 232) {
    const c = n - 16
    const lv = (x: number): number => (x === 0 ? 0 : 55 + x * 40)
    return `rgb(${lv(Math.floor(c / 36))},${lv(Math.floor((c % 36) / 6))},${lv(c % 6)})`
  }
  const g = 8 + (n - 232) * 10
  return `rgb(${g},${g},${g})`
}

/**
 * SGR 색상 코드를 해석해 스타일 구간으로 나눈다. 지원: reset/bold/dim/underline,
 * 16색(30–37/90–97), 256색(38;5;n), 트루컬러(38;2;r;g;b). 배경색·기타 코드는 무시.
 */
export function parseAnsi(text: string): AnsiSegment[] {
  const re = ansiRe()
  const segs: AnsiSegment[] = []
  let fgBasic: number | undefined // 30–37은 인덱스로 두고 bold면 밝은 색으로 매핑
  let fgCss: string | undefined
  let bold = false
  let dim = false
  let underline = false
  let last = 0

  const push = (t: string): void => {
    if (!t) return
    const color = fgCss ?? (fgBasic !== undefined ? (bold ? BRIGHT : BASIC)[fgBasic] : undefined)
    segs.push({ text: t, color, bold, dim, underline })
  }

  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index))
    last = m.index + m[0].length
    const sgr = m[1]
    if (sgr === undefined) continue // SGR이 아닌 시퀀스는 버리기만 한다
    const params = sgr === '' ? [0] : sgr.split(';').map((p) => (p === '' ? 0 : parseInt(p, 10)))
    for (let i = 0; i < params.length; i++) {
      const p = params[i]!
      if (p === 0) {
        fgBasic = fgCss = undefined
        bold = dim = underline = false
      } else if (p === 1) bold = true
      else if (p === 2) dim = true
      else if (p === 22) bold = dim = false
      else if (p === 4) underline = true
      else if (p === 24) underline = false
      else if (p >= 30 && p <= 37) {
        fgBasic = p - 30
        fgCss = undefined
      } else if (p >= 90 && p <= 97) {
        fgBasic = undefined
        fgCss = BRIGHT[p - 90]
      } else if (p === 39) {
        fgBasic = fgCss = undefined
      } else if (p === 38 || p === 48) {
        // extended color: 파라미터 수만큼 건너뛰고, fg(38)일 때만 적용
        const mode = params[i + 1]
        if (mode === 5) {
          if (p === 38) {
            fgBasic = undefined
            fgCss = color256(params[i + 2] ?? -1)
          }
          i += 2
        } else if (mode === 2) {
          if (p === 38) {
            fgBasic = undefined
            fgCss = `rgb(${params[i + 2] ?? 0},${params[i + 3] ?? 0},${params[i + 4] ?? 0})`
          }
          i += 4
        }
      }
      // 그 외(배경 40–47/100–107, italic 등)는 무시
    }
  }
  push(text.slice(last))
  return segs
}

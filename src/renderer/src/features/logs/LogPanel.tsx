import { useEffect, useMemo, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { stripAnsi } from '../../../../shared/ansi'
import type { LogLine } from '../../../../shared/types'
import { Line } from './log-render'
import { findRanges, findRangesRegex, levelOf, textOf, type DisplayLine } from './log-utils'

// Cap how many lines we keep in the view so a chatty program can't grow the
// DOM unbounded and cause jank (full history still lives in the log file).
const MAX = 2000
const FONT_SIZES = ['text-[11px]', 'text-xs', 'text-sm'] as const

const chip = (on: boolean): string =>
  `rounded px-1.5 py-0.5 ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`
const btn = 'rounded px-1.5 py-0.5 hover:bg-accent'

export function LogPanel({
  programId,
  onCollapse
}: {
  programId: string
  onCollapse?: () => void
}): React.JSX.Element {
  const [lines, setLines] = useState<LogLine[]>([])
  const [atBottom, setAtBottom] = useState(true)
  const preRef = useRef<HTMLPreElement>(null)
  const atBottomRef = useRef(true)
  const pendingRef = useRef<LogLine[]>([])
  const rafRef = useRef<number | null>(null)

  // 표시 옵션
  const [procFilter, setProcFilter] = useState<Set<string>>(new Set())
  const [stderrOnly, setStderrOnly] = useState(false)
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set())
  const [wrap, setWrap] = useState(true)
  const [showTime, setShowTime] = useState(false)
  const [collapseDupes, setCollapseDupes] = useState(false)
  const [fontIdx, setFontIdx] = useState(1)
  const [expand, setExpand] = useState(false)

  // 일시정지: 들어오는 로그를 pendingRef에 모아두고 화면만 멈춘다
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const [pendingCount, setPendingCount] = useState(0)

  // 검색
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filterMode, setFilterMode] = useState(false)
  const [regexMode, setRegexMode] = useState(false)
  const [activeMatch, setActiveMatch] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [fileMsg, setFileMsg] = useState<string | null>(null)

  // 재개 버튼에서 구독 effect 안의 flush를 호출할 수 있게 ref로 노출
  const flushRef = useRef<() => void>(() => {})

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
      setPendingCount(0)
      setLines((prev) => {
        const next = prev.concat(inc)
        return next.length > MAX ? next.slice(next.length - MAX) : next
      })
    }
    const off = ipc.on('logs:appended', (batch) => {
      const mine = batch.filter((l) => l.programId === programId)
      if (mine.length === 0) return
      pendingRef.current.push(...mine)
      if (pendingRef.current.length > MAX) {
        pendingRef.current = pendingRef.current.slice(-MAX)
      }
      if (pausedRef.current) {
        setPendingCount(pendingRef.current.length)
        return
      }
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush)
    })
    flushRef.current = flush

    return () => {
      active = false
      off()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [programId])

  // ── 필터 → 검색 필터 → 중복 접기 파이프라인 ──────────────────────────
  const q = searchOpen ? query.trim().toLowerCase() : ''

  // 정규식 모드: 유효하지 않으면 null (입력창 빨간 테두리, 매치 없음)
  const regex = useMemo(() => {
    if (!q || !regexMode) return null
    try {
      return new RegExp(query.trim(), 'gi')
    } catch {
      return null
    }
  }, [q, query, regexMode])
  const regexInvalid = regexMode && q.length > 0 && regex === null

  const rangesOf = (l: LogLine): Array<[number, number]> =>
    regexMode
      ? regex
        ? findRangesRegex(textOf(l), regex)
        : []
      : findRanges(textOf(l).toLowerCase(), q)

  const visible: DisplayLine[] = useMemo(() => {
    let arr = lines
    if (procFilter.size > 0) arr = arr.filter((l) => procFilter.has(l.processName))
    if (stderrOnly) arr = arr.filter((l) => l.stream === 'stderr')
    if (levelFilter.size > 0) arr = arr.filter((l) => levelFilter.has(levelOf(l) ?? ''))
    if (q && filterMode) arr = arr.filter((l) => rangesOf(l).length > 0)
    if (!collapseDupes) return arr.map((line) => ({ line, count: 1 }))
    const out: DisplayLine[] = []
    for (const line of arr) {
      const prev = out[out.length - 1]
      if (prev && prev.line.processName === line.processName && prev.line.text === line.text) {
        prev.count++
      } else out.push({ line, count: 1 })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rangesOf는 q/regex에서 파생
  }, [lines, procFilter, stderrOnly, levelFilter, q, regex, filterMode, collapseDupes])

  const matches = useMemo(() => {
    if (!q) return []
    const res: Array<{ idx: number; ranges: Array<[number, number]> }> = []
    visible.forEach((dl, idx) => {
      const ranges = rangesOf(dl.line)
      if (ranges.length > 0) res.push({ idx, ranges })
    })
    return res
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rangesOf는 q/regex에서 파생
  }, [visible, q, regex])
  const rangesMap = useMemo(() => new Map(matches.map((m) => [m.idx, m.ranges])), [matches])

  // activeMatch === -1 은 "자동: 가장 최근 매치". 탐색하면 절대 인덱스가 되고
  // 매치 수가 줄면 범위 안으로 클램프한다 (렌더 시 파생 — effect에서 setState 금지).
  const effActive =
    matches.length === 0
      ? -1
      : activeMatch === -1
        ? matches.length - 1
        : Math.min(activeMatch, matches.length - 1)
  const activeLineIdx = effActive >= 0 ? (matches[effActive]?.idx ?? -1) : -1

  // 탐색/검색어 변경 시 활성 매치를 화면 가운데로 (스트리밍 증가로는 안 움직임)
  useEffect(() => {
    if (!q) return
    preRef.current?.querySelector('[data-match-active]')?.scrollIntoView({ block: 'center' })
  }, [activeMatch, q])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  // Follow the tail: on new content scroll to bottom — unless the user scrolled
  // up to read (then we pause until they return to the bottom).
  useEffect(() => {
    const el = preRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [visible])

  const onScroll = (): void => {
    const el = preRef.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    atBottomRef.current = bottom
    setAtBottom(bottom)
  }

  const scrollTo = (top: boolean): void => {
    const el = preRef.current
    if (!el) return
    el.scrollTop = top ? 0 : el.scrollHeight
    atBottomRef.current = !top
    setAtBottom(!top)
  }

  const toggleProc = (name: string): void => {
    setProcFilter((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleLevel = (lv: 'error' | 'warn'): void => {
    setLevelFilter((prev) => {
      const next = new Set(prev)
      if (next.has(lv)) next.delete(lv)
      else next.add(lv)
      return next
    })
  }

  const togglePause = (): void => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    if (!next) flushRef.current() // 재개: 모아둔 로그 반영
  }

  const move = (dir: 1 | -1): void => {
    if (matches.length === 0) return
    setActiveMatch((effActive + dir + matches.length) % matches.length)
  }

  const closeSearch = (): void => {
    setSearchOpen(false)
    setQuery('')
    setFilterMode(false)
    setActiveMatch(-1)
  }

  const clear = async (): Promise<void> => {
    await ipc.invoke('logs:clear', programId)
    pendingRef.current = []
    setPendingCount(0)
    setLines([])
  }

  const copy = (): void => {
    // copy plain text — escape codes are display-only
    const text = visible
      .map(
        (dl) =>
          `${dl.line.processName}| ${stripAnsi(dl.line.text)}${dl.count > 1 ? ` ×${dl.count}` : ''}`
      )
      .join('\n')
    void navigator.clipboard.writeText(text)
  }

  const revealFile = async (): Promise<void> => {
    const ok = await ipc.invoke('logs:revealFile', programId)
    if (!ok) {
      setFileMsg("로그 파일이 없습니다 — 설정에서 '로그 파일 저장'을 켜세요")
      setTimeout(() => setFileMsg(null), 3000)
    }
  }

  const procNames = useMemo(() => [...new Set(lines.map((l) => l.processName))], [lines])
  const filtered = visible.length !== lines.length

  return (
    <div
      className="relative mt-2 overflow-hidden rounded border"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          setSearchOpen(true)
          searchInputRef.current?.focus()
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b bg-muted/50 px-2 py-1 text-xs">
        <span className="mr-1 text-muted-foreground">
          {filtered ? `${visible.length}/${lines.length}` : lines.length} 줄
          {paused && pendingCount > 0 && ` · +${pendingCount} 대기`}
        </span>
        {procNames.length > 1 &&
          procNames.map((n) => (
            <button key={n} className={chip(procFilter.has(n))} onClick={() => toggleProc(n)}>
              {n}
            </button>
          ))}
        <button className={chip(stderrOnly)} onClick={() => setStderrOnly((v) => !v)}>
          stderr만
        </button>
        <button
          className={chip(levelFilter.has('error'))}
          onClick={() => toggleLevel('error')}
          title="ERROR/FATAL/Exception 등이 포함된 줄만"
        >
          오류
        </button>
        <button
          className={chip(levelFilter.has('warn'))}
          onClick={() => toggleLevel('warn')}
          title="WARN/WARNING이 포함된 줄만"
        >
          경고
        </button>
        <span className="mx-1 h-3 w-px bg-border" />
        <button className={chip(wrap)} onClick={() => setWrap((v) => !v)} title="긴 줄 줄바꿈">
          줄바꿈
        </button>
        <button className={chip(showTime)} onClick={() => setShowTime((v) => !v)}>
          시간
        </button>
        <button
          className={chip(collapseDupes)}
          onClick={() => setCollapseDupes((v) => !v)}
          title="연속 반복 줄을 ×N으로 접기"
        >
          중복접기
        </button>
        <button className={btn} onClick={() => setFontIdx((i) => Math.max(0, i - 1))}>
          A−
        </button>
        <button
          className={btn}
          onClick={() => setFontIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))}
        >
          A+
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button className={chip(searchOpen)} onClick={() => setSearchOpen((v) => !v)}>
            검색
          </button>
          <button className={chip(paused)} onClick={togglePause}>
            {paused ? '▶ 재개' : '⏸ 정지'}
          </button>
          <button className={btn} onClick={() => scrollTo(true)} title="맨 위로">
            ↑
          </button>
          <button className={btn} onClick={() => scrollTo(false)} title="맨 아래로">
            ↓
          </button>
          <button className={btn} onClick={revealFile} title="로그 파일 위치 열기">
            파일
          </button>
          <button className={btn} onClick={copy}>
            복사
          </button>
          <button className={`${btn} text-destructive`} onClick={clear}>
            지우기
          </button>
          <button className={btn} onClick={() => setExpand((v) => !v)}>
            {expand ? '축소' : '확대'}
          </button>
          {onCollapse && (
            <button className={btn} onClick={onCollapse}>
              접기
            </button>
          )}
        </div>
      </div>
      {searchOpen && (
        <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1 text-xs">
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveMatch(-1) // 새 검색어: 가장 최근 매치부터
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') move(e.shiftKey ? -1 : 1)
              if (e.key === 'Escape') closeSearch()
            }}
            placeholder={
              regexMode ? '정규식 검색 (예: GET|POST)' : '검색 (Enter: 다음, Shift+Enter: 이전)'
            }
            className={`h-6 w-64 rounded border bg-background px-2 focus-visible:outline-none focus-visible:ring-1 ${regexInvalid ? 'border-destructive focus-visible:ring-destructive' : 'border-input focus-visible:ring-ring'}`}
          />
          <button
            className={chip(regexMode)}
            onClick={() => {
              setRegexMode((v) => !v)
              setActiveMatch(-1)
            }}
            title="정규식 검색"
          >
            .*
          </button>
          <span className="w-16 text-center text-muted-foreground">
            {regexInvalid
              ? '식 오류'
              : matches.length > 0
                ? `${effActive + 1}/${matches.length} 줄`
                : q
                  ? '0 줄'
                  : ''}
          </span>
          <button className={btn} onClick={() => move(-1)} title="이전 매치">
            ▲
          </button>
          <button className={btn} onClick={() => move(1)} title="다음 매치">
            ▼
          </button>
          <button
            className={chip(filterMode)}
            onClick={() => setFilterMode((v) => !v)}
            title="일치하는 줄만 표시"
          >
            일치만 표시
          </button>
          <button className={`${btn} ml-auto`} onClick={closeSearch}>
            ✕
          </button>
        </div>
      )}
      {fileMsg && (
        <div className="border-b bg-muted/30 px-2 py-1 text-xs text-destructive">{fileMsg}</div>
      )}
      <pre
        ref={preRef}
        onScroll={onScroll}
        className={`m-0 min-h-32 resize-y overflow-auto bg-black p-2 font-mono leading-relaxed text-[#cccccc] ${FONT_SIZES[fontIdx]} ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${expand ? 'h-[88vh]' : 'h-[max(28rem,70vh)]'}`}
      >
        {visible.length === 0 ? (
          <span className="text-zinc-500">
            {lines.length === 0 ? '(로그 없음)' : '(필터와 일치하는 줄 없음)'}
          </span>
        ) : (
          visible.map((dl, i) => (
            <Line
              key={i}
              line={dl.line}
              count={dl.count}
              showTime={showTime}
              ranges={rangesMap.get(i)}
              active={i === activeLineIdx}
            />
          ))
        )}
      </pre>
      {!atBottom && !paused && (
        <button
          onClick={() => scrollTo(false)}
          className="absolute bottom-3 right-4 rounded-full bg-gray-800/90 px-3 py-1 text-xs text-white shadow hover:bg-gray-700"
        >
          ↓ 최신 로그
        </button>
      )}
    </div>
  )
}

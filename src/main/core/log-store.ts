import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { LogLine } from '../../shared/types'

export interface LogStoreOpts {
  logDir?: string
}

export class LogStore {
  private buffers = new Map<string, LogLine[]>()
  private subscribers = new Set<(lines: LogLine[]) => void>()
  private pending: LogLine[] = []
  private flushScheduled = false
  private fileLogging = false
  private logDir: string | undefined
  private logDirCreated = false

  constructor(
    private maxLines: number,
    opts?: LogStoreOpts
  ) {
    this.logDir = opts?.logDir
  }

  setFileLogging(enabled: boolean): void {
    this.fileLogging = enabled
  }

  append(line: LogLine): void {
    const buf = this.buffers.get(line.programId) ?? []
    buf.push(line)
    if (buf.length > this.maxLines) buf.splice(0, buf.length - this.maxLines)
    this.buffers.set(line.programId, buf)

    this.pending.push(line)
    if (!this.flushScheduled) {
      this.flushScheduled = true
      queueMicrotask(() => this.flush())
    }

    if (this.fileLogging && this.logDir) {
      try {
        if (!this.logDirCreated) {
          mkdirSync(this.logDir, { recursive: true })
          this.logDirCreated = true
        }
        const ts = new Date(line.ts).toISOString()
        const entry = `[${ts}] ${line.processName}(${line.stream}): ${line.text}\n`
        appendFileSync(join(this.logDir, `${line.programId}.log`), entry, 'utf-8')
      } catch {
        // file logging must not crash the app
      }
    }
  }

  private flush(): void {
    this.flushScheduled = false
    if (this.pending.length === 0) return
    const batch = this.pending
    this.pending = []
    for (const cb of this.subscribers) cb(batch)
  }

  get(programId: string): LogLine[] {
    return [...(this.buffers.get(programId) ?? [])]
  }

  clear(programId: string): void {
    this.buffers.delete(programId)
  }

  subscribe(cb: (lines: LogLine[]) => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }
}

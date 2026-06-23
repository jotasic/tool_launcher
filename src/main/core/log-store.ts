import type { LogLine } from '../../shared/types'

export class LogStore {
  private buffers = new Map<string, LogLine[]>()
  private subscribers = new Set<(lines: LogLine[]) => void>()
  private pending: LogLine[] = []
  private flushScheduled = false

  constructor(private maxLines: number) {}

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

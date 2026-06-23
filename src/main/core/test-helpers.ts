import { EventEmitter } from 'node:events'
import type { ChildLike, ProcessDeps } from './process-manager'

export class FakeChild extends EventEmitter implements ChildLike {
  pid = Math.floor(Math.random() * 100000) + 1
  stdout = new EventEmitter() as any
  stderr = new EventEmitter() as any
  killed = false
  kill(_signal?: string): boolean {
    this.killed = true
    // 실제 종료는 테스트가 emit('exit')로 흉내냄
    return true
  }
  emitStdout(text: string) { this.stdout.emit('data', Buffer.from(text)) }
  emitExit(code: number | null, signal: string | null = null) { this.emit('exit', code, signal) }
}

export function makeFakeDeps(): { deps: ProcessDeps; children: FakeChild[] } {
  const children: FakeChild[] = []
  const deps: ProcessDeps = {
    spawn: () => { const c = new FakeChild(); children.push(c); return c },
    killTree: async () => {},
    now: () => 0,
    delay: async () => {},
  }
  return { deps, children }
}

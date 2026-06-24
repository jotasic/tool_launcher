import { spawn as nodeSpawn } from 'node:child_process'
import treeKill from 'tree-kill'
import type { ProcessDeps, ChildLike } from './process-manager'

export function createRealDeps(): ProcessDeps {
  return {
    spawn: (command, args, opts) =>
      nodeSpawn(command, args, {
        cwd: opts.cwd,
        env: opts.env,
        detached: opts.detached,
        shell: false
      }) as unknown as ChildLike,
    killTree: (pid, signal) =>
      new Promise<void>((resolve) => treeKill(pid, signal, () => resolve())),
    now: () => Date.now(),
    delay: (ms) => new Promise((r) => setTimeout(r, ms))
  }
}

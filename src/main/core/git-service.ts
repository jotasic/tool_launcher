import { spawn } from 'node:child_process'

export interface GitRunner {
  run: (args: string[], opts: { cwd?: string }, onLine: (line: string) => void) => Promise<{ code: number }>
}

export class GitService {
  constructor(private deps: GitRunner) {}

  async clone(
    req: { repoUrl: string; branch?: string; targetDir: string },
    onProgress: (line: string) => void,
  ): Promise<void> {
    const args = ['clone']
    if (req.branch) args.push('--branch', req.branch)
    args.push(req.repoUrl, req.targetDir)
    const { code } = await this.deps.run(args, {}, onProgress)
    if (code !== 0) throw new Error(`git clone failed (exit ${code})`)
  }

  async pull(dir: string, onProgress: (line: string) => void): Promise<void> {
    const { code } = await this.deps.run(['pull'], { cwd: dir }, onProgress)
    if (code !== 0) throw new Error(`git pull failed (exit ${code})`)
  }
}

export function createGitRunner(): GitRunner {
  return {
    run: (args, opts, onLine) =>
      new Promise((resolve) => {
        const child = spawn('git', args, { cwd: opts.cwd })
        const handle = (chunk: Buffer) => {
          for (const l of chunk.toString().split('\n')) if (l.length) onLine(l)
        }
        child.stdout.on('data', handle)
        child.stderr.on('data', handle)
        child.on('exit', (code) => resolve({ code: code ?? 1 }))
      }),
  }
}

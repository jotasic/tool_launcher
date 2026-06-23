import { describe, it, expect } from 'vitest'
import { GitService } from './git-service'

describe('GitService', () => {
  it('runs clone with branch and targetDir', async () => {
    const calls: string[][] = []
    const svc = new GitService({ run: async (args) => { calls.push(args); return { code: 0 } } })
    await svc.clone({ repoUrl: 'https://x/y.git', branch: 'dev', targetDir: '/tmp/y' }, () => {})
    expect(calls[0]).toEqual(['clone', '--branch', 'dev', 'https://x/y.git', '/tmp/y'])
  })

  it('omits --branch when not given', async () => {
    const calls: string[][] = []
    const svc = new GitService({ run: async (args) => { calls.push(args); return { code: 0 } } })
    await svc.clone({ repoUrl: 'https://x/y.git', targetDir: '/tmp/y' }, () => {})
    expect(calls[0]).toEqual(['clone', 'https://x/y.git', '/tmp/y'])
  })

  it('throws on non-zero exit', async () => {
    const svc = new GitService({ run: async () => ({ code: 128 }) })
    await expect(svc.clone({ repoUrl: 'bad', targetDir: '/tmp/y' }, () => {})).rejects.toThrow()
  })

  it('runs pull in the given dir', async () => {
    const seen: { args: string[]; cwd?: string }[] = []
    const svc = new GitService({ run: async (args, opts) => { seen.push({ args, cwd: opts.cwd }); return { code: 0 } } })
    await svc.pull('/tmp/y', () => {})
    expect(seen[0]).toEqual({ args: ['pull'], cwd: '/tmp/y' })
  })

  it('forwards progress lines', async () => {
    const lines: string[] = []
    const svc = new GitService({ run: async (_a, _o, onLine) => { onLine('Cloning...'); return { code: 0 } } })
    await svc.clone({ repoUrl: 'x', targetDir: '/tmp/y' }, (l) => lines.push(l))
    expect(lines).toContain('Cloning...')
  })
})

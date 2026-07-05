import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ProcessFields, type ProcDraft } from './ProcessFields'
import { OpenFields } from './OpenFields'
import { GitFields } from './GitFields'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'
import type { Program, OpenSpec, GitSpec, ProcessSpec } from '../../../../shared/types'

const emptyOpen: OpenSpec = { mode: 'none', autoOpenOnStart: false }

/** Build the editable draft list from saved processes: env is flattened into
 * `envText` for the textarea (see submit() for the reverse parse on save). */
function toDrafts(processes: ProcessSpec[]): ProcDraft[] {
  return processes.map((p) => ({
    ...p,
    envText: p.env
      ? Object.entries(p.env)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n')
      : undefined
  }))
}

export function ProgramForm({
  existing,
  trigger
}: {
  existing?: Program
  trigger: React.ReactNode
}) {
  const create = useProgramsStore((s) => s.create)
  const update = useProgramsStore((s) => s.update)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? '')
  const [workingDir, setWorkingDir] = useState(existing?.workingDir ?? '')
  const [processes, setProcesses] = useState<ProcDraft[]>(
    existing ? toDrafts(existing.processes) : [{ name: 'proc1', command: '', order: 0 }]
  )
  const [openSpec, setOpenSpec] = useState<OpenSpec>(existing?.open ?? emptyOpen)
  const [git, setGit] = useState<GitSpec | undefined>(existing?.git)
  const [autoRestart, setAutoRestart] = useState(existing?.autoRestart ?? false)
  const [autoStartOnLaunch, setAutoStartOnLaunch] = useState(existing?.autoStartOnLaunch ?? false)

  const [cloning, setCloning] = useState(false)
  const [cloneLog, setCloneLog] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // Form reset on dialog open: guarded by `if (open)` so it only runs when the
      // dialog transitions to visible — not a cascading render loop.
      /* eslint-disable react-hooks/set-state-in-effect */
      setName(existing?.name ?? '')
      setWorkingDir(existing?.workingDir ?? '')
      setProcesses(
        existing ? toDrafts(existing.processes) : [{ name: 'proc1', command: '', order: 0 }]
      )
      setOpenSpec(existing?.open ?? emptyOpen)
      setGit(existing?.git)
      setAutoRestart(existing?.autoRestart ?? false)
      setAutoStartOnLaunch(existing?.autoStartOnLaunch ?? false)
      setSaveError(null)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open, existing])

  const pickDir = async () => {
    const dir = await ipc.invoke('dialog:pickDirectory')
    if (dir) setWorkingDir(dir)
  }

  const handleClone = async () => {
    if (!git?.repoUrl || !workingDir) return
    setCloning(true)
    setCloneLog([])

    const unsub = ipc.on('git:progress', (payload) => {
      const { text } = payload as { text: string }
      setCloneLog((prev) => {
        const next = [...prev, text]
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
        return next
      })
    })

    try {
      await ipc.invoke('git:clone', {
        repoUrl: git.repoUrl,
        branch: git.branch,
        targetDir: workingDir
      })
      setCloneLog((prev) => [...prev, '✓ 복제 완료'])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCloneLog((prev) => [...prev, `오류: ${msg}`])
    } finally {
      unsub()
      setCloning(false)
    }
  }

  const submit = async () => {
    // Args are stored split-on-space while typing (so spaces type correctly);
    // drop empty tokens (from double/trailing spaces) only here, at save time.
    // Same idea for env: it's edited as raw `envText` while typing, and only
    // parsed into a KEY -> value map here, at save time.
    const cleanedProcesses: ProcessSpec[] = processes.map(({ envText, ...p }) => {
      const args = (p.args ?? []).filter((a) => a.length > 0)
      const envEntries = (envText ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => line.includes('='))
        .map((line): [string, string] => {
          const eq = line.indexOf('=')
          return [line.slice(0, eq), line.slice(eq + 1)]
        })
        .filter(([key]) => key.length > 0)
      const startDelayMs =
        typeof p.startDelayMs === 'number' && p.startDelayMs > 0 ? p.startDelayMs : undefined
      return {
        ...p,
        args: args.length > 0 ? args : undefined,
        env: envEntries.length > 0 ? Object.fromEntries(envEntries) : undefined,
        startDelayMs
      }
    })
    const payload: Omit<Program, 'id'> = {
      name,
      workingDir,
      processes: cleanedProcesses,
      open: openSpec,
      autoRestart,
      autoStartOnLaunch,
      ...(git ? { git } : {})
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (existing) await update({ ...existing, ...payload })
      else await create(payload)
      setOpen(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const canClone = !!(git?.repoUrl && workingDir)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{existing ? '프로그램 편집' : '프로그램 추가'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>이름</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>작업 폴더</Label>
            <div className="flex gap-2">
              <Input value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} />
              <Button type="button" variant="outline" onClick={pickDir}>
                선택
              </Button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>git (선택)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canClone || cloning}
                onClick={handleClone}
              >
                {cloning ? '복제 중...' : 'git clone'}
              </Button>
            </div>
            <GitFields value={git} onChange={setGit} />
            {cloneLog.length > 0 && (
              <div className="mt-2 max-h-32 overflow-auto rounded border bg-muted p-2 font-mono text-xs">
                {cloneLog.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
          <div>
            <Label>프로세스</Label>
            <ProcessFields value={processes} onChange={setProcesses} />
          </div>
          <div className="space-y-2 rounded border p-3">
            <label className="flex items-center gap-2">
              <Switch checked={autoRestart} onCheckedChange={setAutoRestart} />
              크래시 시 자동 재시작
            </label>
            <p className="text-xs text-muted-foreground">
              비정상 종료되면 몇 초 간격으로 다시 시작합니다 (최대 5회)
            </p>
            <label className="flex items-center gap-2">
              <Switch checked={autoStartOnLaunch} onCheckedChange={setAutoStartOnLaunch} />
              런처 시작 시 자동 시작
            </label>
          </div>
          <OpenFields
            value={openSpec}
            onChange={setOpenSpec}
            processNames={processes.map((p) => p.name).filter(Boolean)}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={submit}
              disabled={saving || !name || !workingDir || processes.some((p) => !p.command)}
            >
              {saving ? '저장 중...' : '저장'}
            </Button>
            {saveError && <span className="text-sm text-destructive">{saveError}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

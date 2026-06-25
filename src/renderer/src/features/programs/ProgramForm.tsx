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
import { ProcessFields } from './ProcessFields'
import { OpenFields } from './OpenFields'
import { GitFields } from './GitFields'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'
import type { Program, OpenSpec, GitSpec } from '../../../../shared/types'

const emptyOpen: OpenSpec = { mode: 'none', autoOpenOnStart: false }

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
  const [processes, setProcesses] = useState(
    existing?.processes ?? [{ name: 'proc1', command: '', order: 0 }]
  )
  const [openSpec, setOpenSpec] = useState<OpenSpec>(existing?.open ?? emptyOpen)
  const [git, setGit] = useState<GitSpec | undefined>(existing?.git)

  const [cloning, setCloning] = useState(false)
  const [cloneLog, setCloneLog] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      // Form reset on dialog open: guarded by `if (open)` so it only runs when the
      // dialog transitions to visible — not a cascading render loop.
      /* eslint-disable react-hooks/set-state-in-effect */
      setName(existing?.name ?? '')
      setWorkingDir(existing?.workingDir ?? '')
      setProcesses(existing?.processes ?? [{ name: 'proc1', command: '', order: 0 }])
      setOpenSpec(existing?.open ?? emptyOpen)
      setGit(existing?.git)
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
    const cleanedProcesses = processes.map((p) => {
      const args = (p.args ?? []).filter((a) => a.length > 0)
      return { ...p, args: args.length > 0 ? args : undefined }
    })
    const payload: Omit<Program, 'id'> = {
      name,
      workingDir,
      processes: cleanedProcesses,
      open: openSpec,
      ...(git ? { git } : {})
    }
    if (existing) await update({ ...existing, ...payload })
    else await create(payload)
    setOpen(false)
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
          <OpenFields value={openSpec} onChange={setOpenSpec} />
          <Button
            type="button"
            onClick={submit}
            disabled={!name || !workingDir || processes.some((p) => !p.command)}
          >
            저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

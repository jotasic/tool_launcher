import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ProcessFields } from './ProcessFields'
import { OpenFields } from './OpenFields'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'
import type { Program, OpenSpec } from '../../../../shared/types'

const emptyOpen: OpenSpec = { mode: 'none', autoOpenOnStart: false }

export function ProgramForm({ existing, trigger }: { existing?: Program; trigger: React.ReactNode }) {
  const create = useProgramsStore((s) => s.create)
  const update = useProgramsStore((s) => s.update)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? '')
  const [workingDir, setWorkingDir] = useState(existing?.workingDir ?? '')
  const [processes, setProcesses] = useState(existing?.processes ?? [{ name: 'proc1', command: '', order: 0 }])
  const [openSpec, setOpenSpec] = useState<OpenSpec>(existing?.open ?? emptyOpen)

  const pickDir = async () => {
    const dir = await ipc.invoke('dialog:pickDirectory')
    if (dir) setWorkingDir(dir)
  }

  const submit = async () => {
    const payload = { name, workingDir, processes, open: openSpec }
    if (existing) await update({ ...existing, ...payload })
    else await create(payload)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle>{existing ? '프로그램 편집' : '프로그램 추가'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>이름</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>작업 폴더</Label>
            <div className="flex gap-2">
              <Input value={workingDir} onChange={(e) => setWorkingDir(e.target.value)} />
              <Button variant="outline" onClick={pickDir}>선택</Button>
            </div>
          </div>
          <div><Label>프로세스</Label><ProcessFields value={processes} onChange={setProcesses} /></div>
          <OpenFields value={openSpec} onChange={setOpenSpec} />
          <Button onClick={submit} disabled={!name || !workingDir || processes.some((p) => !p.command)}>저장</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

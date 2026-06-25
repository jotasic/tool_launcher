import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ipc } from '../../lib/ipc'
import type { ProcessSpec } from '../../../../shared/types'

export function ProcessFields({
  value,
  onChange
}: {
  value: ProcessSpec[]
  onChange: (v: ProcessSpec[]) => void
}) {
  const update = (i: number, patch: Partial<ProcessSpec>): void =>
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const add = (): void =>
    onChange([...value, { name: `proc${value.length + 1}`, command: '', order: value.length }])
  const remove = (i: number): void => onChange(value.filter((_, idx) => idx !== i))
  const pickCwd = async (i: number): Promise<void> => {
    const dir = await ipc.invoke('dialog:pickDirectory')
    if (dir) update(i, { cwd: dir })
  }

  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={i} className="space-y-2 rounded border p-2">
          <div className="grid grid-cols-12 items-center gap-2">
            <Input
              className="col-span-2"
              placeholder="이름"
              value={p.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <Input
              className="col-span-5"
              placeholder="명령 (예: python, npm)"
              value={p.command}
              onChange={(e) => update(i, { command: e.target.value })}
            />
            <Input
              className="col-span-3"
              placeholder="인자 (공백구분)"
              value={(p.args ?? []).join(' ')}
              onChange={(e) => update(i, { args: e.target.value.split(' ').filter(Boolean) })}
            />
            <Input
              className="col-span-1"
              type="number"
              title="시작 순서"
              value={p.order}
              onChange={(e) => update(i, { order: Number(e.target.value) })}
            />
            <Button type="button" className="col-span-1" variant="ghost" onClick={() => remove(i)}>
              ✕
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="flex-1"
              placeholder="이 프로세스 작업 폴더 (비우면 프로그램 작업 폴더 사용)"
              value={p.cwd ?? ''}
              onChange={(e) => update(i, { cwd: e.target.value || undefined })}
            />
            <Button type="button" variant="outline" onClick={() => pickCwd(i)}>
              폴더
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={add}>
        + 프로세스 추가
      </Button>
    </div>
  )
}

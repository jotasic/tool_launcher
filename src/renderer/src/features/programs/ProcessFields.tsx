import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ipc } from '../../lib/ipc'
import type { ProcessSpec } from '../../../../shared/types'

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="mb-1 text-xs text-muted-foreground">{children}</div>
}

export function ProcessFields({
  value,
  onChange
}: {
  value: ProcessSpec[]
  onChange: (v: ProcessSpec[]) => void
}): React.JSX.Element {
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
    <div className="space-y-3">
      {value.map((p, i) => (
        <div key={i} className="space-y-2 rounded border p-3">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-3">
              <FieldLabel>이름</FieldLabel>
              <Input
                placeholder="backend"
                value={p.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
            </div>
            <div className="col-span-5">
              <FieldLabel>명령 (실행 파일)</FieldLabel>
              <Input
                placeholder="python / npm / node"
                value={p.command}
                onChange={(e) => update(i, { command: e.target.value })}
              />
            </div>
            <div className="col-span-4">
              <FieldLabel>인자 (공백으로 구분)</FieldLabel>
              <Input
                placeholder="-m uvicorn main:app --reload"
                value={(p.args ?? []).join(' ')}
                onChange={(e) => update(i, { args: e.target.value.split(' ') })}
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-24">
              <FieldLabel>시작 순서</FieldLabel>
              <Input
                type="number"
                value={p.order}
                onChange={(e) => update(i, { order: Number(e.target.value) })}
              />
            </div>
            <div className="flex-1">
              <FieldLabel>작업 폴더 (비우면 위 &quot;작업 폴더&quot; 사용)</FieldLabel>
              <Input
                placeholder="/path/to/backend"
                value={p.cwd ?? ''}
                onChange={(e) => update(i, { cwd: e.target.value || undefined })}
              />
            </div>
            <Button type="button" variant="outline" onClick={() => pickCwd(i)}>
              폴더
            </Button>
            <Button type="button" variant="ghost" onClick={() => remove(i)}>
              ✕ 삭제
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

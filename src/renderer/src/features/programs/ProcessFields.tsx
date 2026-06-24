import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ProcessSpec } from '../../../../shared/types'

export function ProcessFields({ value, onChange }: { value: ProcessSpec[]; onChange: (v: ProcessSpec[]) => void }) {
  const update = (i: number, patch: Partial<ProcessSpec>) =>
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const add = () =>
    onChange([...value, { name: `proc${value.length + 1}`, command: '', order: value.length }])
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <Input className="col-span-2" placeholder="이름" value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
          <Input className="col-span-5" placeholder="명령 (예: python)" value={p.command} onChange={(e) => update(i, { command: e.target.value })} />
          <Input className="col-span-3" placeholder="인자 (공백구분)" value={(p.args ?? []).join(' ')} onChange={(e) => update(i, { args: e.target.value.split(' ').filter(Boolean) })} />
          <Input className="col-span-1" type="number" value={p.order} onChange={(e) => update(i, { order: Number(e.target.value) })} />
          <Button type="button" className="col-span-1" variant="ghost" onClick={() => remove(i)}>✕</Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={add}>+ 프로세스 추가</Button>
    </div>
  )
}

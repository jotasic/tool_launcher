import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ipc } from '../../lib/ipc'
import type { ProcessSpec } from '../../../../shared/types'

/** Draft shape used while editing in the form: env is edited as raw textarea
 * text (`envText`) and only parsed into `ProcessSpec.env` at save time — see
 * ProgramForm's submit(), which mirrors the args-parsing-on-save pattern. */
export type ProcDraft = ProcessSpec & { envText?: string }

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="mb-1 text-xs text-muted-foreground">{children}</div>
}

export function ProcessFields({
  value,
  onChange
}: {
  value: ProcDraft[]
  onChange: (v: ProcDraft[]) => void
}): React.JSX.Element {
  const update = (i: number, patch: Partial<ProcDraft>): void =>
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
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-20">
              <FieldLabel>시작 순서</FieldLabel>
              <Input
                type="number"
                value={p.order}
                onChange={(e) => update(i, { order: Number(e.target.value) })}
              />
            </div>
            <div className="w-28">
              <FieldLabel>시작 지연(ms)</FieldLabel>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={p.startDelayMs ?? ''}
                onChange={(e) => {
                  const raw = e.target.value
                  update(i, { startDelayMs: raw === '' ? undefined : Number(raw) })
                }}
              />
            </div>
            <div className="flex-1 min-w-40">
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
          <div>
            <FieldLabel>환경변수 (KEY=값, 한 줄에 하나)</FieldLabel>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              rows={3}
              placeholder={'PORT=8001\nAPI_KEY=xxx'}
              value={p.envText ?? ''}
              onChange={(e) => update(i, { envText: e.target.value })}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={add}>
        + 프로세스 추가
      </Button>
    </div>
  )
}

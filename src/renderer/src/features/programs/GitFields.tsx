import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { GitSpec } from '../../../../shared/types'

export function GitFields({
  value,
  onChange
}: {
  value: GitSpec | undefined
  onChange: (v: GitSpec | undefined) => void
}) {
  const repoUrl = value?.repoUrl ?? ''
  const branch = value?.branch ?? ''
  const autoPullOnStart = value?.autoPullOnStart ?? false

  const update = (patch: Partial<GitSpec>) => {
    const next = { repoUrl, branch, autoPullOnStart, ...value, ...patch }
    if (!next.repoUrl.trim()) {
      onChange(undefined)
    } else {
      onChange({
        repoUrl: next.repoUrl,
        ...(next.branch ? { branch: next.branch } : {}),
        ...(next.autoPullOnStart ? { autoPullOnStart: true } : {})
      })
    }
  }

  return (
    <div className="space-y-2 rounded border p-3">
      <div>
        <Label>저장소 URL</Label>
        <Input
          placeholder="https://github.com/owner/repo.git"
          value={repoUrl}
          onChange={(e) => update({ repoUrl: e.target.value })}
        />
      </div>
      <div>
        <Label>브랜치 (선택)</Label>
        <Input
          placeholder="main"
          value={branch}
          onChange={(e) => update({ branch: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={autoPullOnStart}
          onCheckedChange={(checked) => update({ autoPullOnStart: checked })}
        />
        시작 시 자동 pull
      </label>
    </div>
  )
}

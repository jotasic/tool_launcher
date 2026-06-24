import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { OpenSpec, OpenMode } from '../../../../shared/types'

export function OpenFields({
  value,
  onChange
}: {
  value: OpenSpec
  onChange: (v: OpenSpec) => void
}) {
  return (
    <div className="space-y-2 rounded border p-3">
      <Label>열기 동작</Label>
      <select
        className="w-full rounded border p-2"
        value={value.mode}
        onChange={(e) => onChange({ ...value, mode: e.target.value as OpenMode })}
      >
        <option value="none">없음 (자체 창/백그라운드)</option>
        <option value="url">정적 URL</option>
        <option value="url-from-log">로그에서 URL 자동탐지</option>
        <option value="path">파일/폴더 경로</option>
      </select>

      {(value.mode === 'url' || value.mode === 'path') && (
        <Input
          placeholder={value.mode === 'url' ? 'http://localhost:3000' : '/path/to/file'}
          value={value.value ?? ''}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
      )}
      {value.mode === 'url-from-log' && (
        <Input
          placeholder="정규식 (비우면 기본값 사용)"
          value={value.logPattern ?? ''}
          onChange={(e) => onChange({ ...value, logPattern: e.target.value })}
        />
      )}
      {value.mode !== 'none' && (
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={value.autoOpenOnStart}
            onCheckedChange={(c) => onChange({ ...value, autoOpenOnStart: c })}
          />
          시작 시 자동 열기
        </label>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '../../stores/settings'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'
import type { Settings } from '../../../../shared/types'

const THEME_LABELS: Record<Settings['theme'], string> = {
  light: '라이트',
  dark: '다크',
  system: '시스템'
}

export function SettingsDialog({ trigger }: { trigger: React.ReactNode }) {
  const { settings, load, save } = useSettingsStore()
  const reloadPrograms = useProgramsStore((s) => s.load)
  useEffect(() => {
    load()
  }, [load])

  // 텍스트/숫자 입력은 로컬 draft로 관리하고 blur/Enter 시점에만 저장한다
  // (키 입력마다 IPC 왕복이 발생하지 않도록).
  const [initialized, setInitialized] = useState(false)
  const [bufferDraft, setBufferDraft] = useState('')
  const [patternDraft, setPatternDraft] = useState('')
  useEffect(() => {
    if (settings && !initialized) {
      // 최초 로드시 한 번만 draft를 채운다: `!initialized`로 가드되어 있어
      // 저장으로 인한 settings 갱신이 draft를 덮어쓰지 않는다.
      /* eslint-disable react-hooks/set-state-in-effect */
      setBufferDraft(String(settings.logBufferLines))
      setPatternDraft(settings.defaultLogPattern)
      setInitialized(true)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [settings, initialized])

  const bufferNum = Number(bufferDraft)
  const bufferInvalid = bufferDraft.trim() === '' || !Number.isInteger(bufferNum) || bufferNum < 1

  const commitBufferLines = () => {
    if (!settings || bufferInvalid) return
    save({ ...settings, logBufferLines: bufferNum })
  }
  const commitPattern = () => {
    if (!settings) return
    save({ ...settings, defaultLogPattern: patternDraft })
  }

  const [exported, setExported] = useState(false)
  const exportPrograms = async () => {
    const json = await ipc.invoke('programs:export')
    await navigator.clipboard.writeText(json)
    setExported(true)
    setTimeout(() => setExported(false), 2000)
  }

  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importDone, setImportDone] = useState(false)

  const openImport = () => {
    setImportOpen(true)
    setImportText('')
    setImportError(null)
    setImportDone(false)
  }
  const cancelImport = () => {
    setImportOpen(false)
    setImportText('')
    setImportError(null)
  }
  const runImport = async () => {
    try {
      await ipc.invoke('programs:import', importText)
      await reloadPrograms()
      setImportOpen(false)
      setImportText('')
      setImportError(null)
      setImportDone(true)
      setTimeout(() => setImportDone(false), 2000)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>설정</DialogTitle>
        </DialogHeader>
        {!settings ? (
          <p className="text-sm text-muted-foreground">설정을 불러오는 중...</p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>로그 버퍼 줄 수</Label>
              <Input
                type="number"
                min={1}
                value={bufferDraft}
                onChange={(e) => setBufferDraft(e.target.value)}
                onBlur={commitBufferLines}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                className={cn(bufferInvalid && 'border-destructive focus-visible:ring-destructive')}
              />
              {bufferInvalid && (
                <p className="mt-1 text-xs text-destructive">1 이상의 정수를 입력하세요.</p>
              )}
            </div>
            <label className="flex items-center gap-2">
              <Switch
                checked={settings.logToFile}
                onCheckedChange={(c) => save({ ...settings, logToFile: c })}
              />
              로그 파일 저장
            </label>
            <div>
              <label className="flex items-center gap-2">
                <Switch
                  checked={settings.launchAtLogin}
                  onCheckedChange={(c) => save({ ...settings, launchAtLogin: c })}
                />
                로그인 시 자동 실행
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                컴퓨터에 로그인하면 Tool Launcher가 자동으로 켜집니다 (macOS/Windows)
              </p>
            </div>
            <div>
              <Label>기본 로그 URL 정규식</Label>
              <Input
                value={patternDraft}
                onChange={(e) => setPatternDraft(e.target.value)}
                onBlur={commitPattern}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            </div>
            <div>
              <Label>테마</Label>
              <Select
                value={settings.theme}
                onValueChange={(v) => save({ ...settings, theme: v as Settings['theme'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(THEME_LABELS) as Settings['theme'][]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {THEME_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button type="button" variant="outline" onClick={exportPrograms}>
                {exported ? '✓ 복사됨' : '프로그램 내보내기'}
              </Button>
              {!importOpen && (
                <Button type="button" variant="outline" onClick={openImport}>
                  가져오기
                </Button>
              )}
              {importDone && <span className="text-xs text-muted-foreground">✓ 가져오기 완료</span>}
            </div>
            {importOpen && (
              <div className="space-y-2 rounded border p-3">
                <p className="text-xs text-destructive">
                  ⚠ 가져오면 기존 프로그램 목록이 전부 교체됩니다
                </p>
                <textarea
                  className="flex min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="가져올 프로그램 JSON을 붙여넣으세요"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                {importError && <p className="text-xs text-destructive">{importError}</p>}
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={runImport} disabled={!importText}>
                    가져오기 실행
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={cancelImport}>
                    취소
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

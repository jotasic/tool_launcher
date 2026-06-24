import { useEffect } from 'react'
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
import { useSettingsStore } from '../../stores/settings'
import { useProgramsStore } from '../../stores/programs'
import { ipc } from '../../lib/ipc'

export function SettingsDialog({ trigger }: { trigger: React.ReactNode }) {
  const { settings, load, save } = useSettingsStore()
  const reloadPrograms = useProgramsStore((s) => s.load)
  useEffect(() => {
    load()
  }, [load])

  const exportPrograms = async () => {
    const json = await ipc.invoke('programs:export')
    await navigator.clipboard.writeText(json)
    alert('프로그램 정의가 클립보드에 복사되었습니다.')
  }
  const importPrograms = async () => {
    const json = prompt('가져올 프로그램 JSON을 붙여넣으세요:')
    if (json) {
      await ipc.invoke('programs:import', json)
      await reloadPrograms()
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
                value={settings.logBufferLines}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  if (Number.isInteger(n) && n >= 1) {
                    save({ ...settings, logBufferLines: n })
                  }
                }}
              />
            </div>
            <label className="flex items-center gap-2">
              <Switch
                checked={settings.logToFile}
                onCheckedChange={(c) => save({ ...settings, logToFile: c })}
              />
              로그 파일 저장
            </label>
            <div>
              <Label>기본 로그 URL 정규식</Label>
              <Input
                value={settings.defaultLogPattern}
                onChange={(e) => save({ ...settings, defaultLogPattern: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={exportPrograms}>
                프로그램 내보내기
              </Button>
              <Button type="button" variant="outline" onClick={importPrograms}>
                가져오기
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

import { Tray, Menu, app, nativeImage, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { AppContext } from './app-context'
import { startProgramWithPull } from './start-program'

export function setupTray(win: BrowserWindow, ctx: AppContext): Tray {
  const raw = nativeImage.createFromPath(join(__dirname, '../../resources/tray-icon.png'))
  const icon = raw.resize({ width: 16, height: 16 })
  const tray = new Tray(icon)

  const isOn = (id: string): boolean => {
    const s = ctx.processes.getRuntime(id).status
    return s === 'running' || s === 'starting'
  }

  const rebuild = (): void => {
    const programs = ctx.store.listPrograms()
    const runningCount = programs.filter((p) => isOn(p.id)).length
    // 창을 열지 않고도 트레이에서 바로 켜고 끌 수 있게 프로그램별 토글 제공
    const programItems = programs.map((p) => {
      const on = isOn(p.id)
      return {
        label: `${on ? '●' : '○'} ${p.name}`,
        click: (): void => {
          if (on) void ctx.processes.stop(p.id)
          else void startProgramWithPull(ctx, p)
        }
      }
    })
    const menu = Menu.buildFromTemplate([
      { label: '창 열기', click: () => win.show() },
      { label: `실행 중: ${runningCount}/${programs.length}개`, enabled: false },
      { type: 'separator' },
      ...programItems,
      ...(programItems.length > 0 ? [{ type: 'separator' as const }] : []),
      { label: '종료', click: () => app.quit() }
    ])
    tray.setContextMenu(menu)
  }

  rebuild()
  ctx.processes.onRuntimeChange(rebuild)
  ctx.programsChanged.add(rebuild)
  tray.on('click', () => win.show())
  return tray
}

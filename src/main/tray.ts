import { Tray, Menu, app, nativeImage, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { AppContext } from './app-context'

export function setupTray(win: BrowserWindow, ctx: AppContext): Tray {
  const raw = nativeImage.createFromPath(join(__dirname, '../../resources/tray-icon.png'))
  const icon = raw.resize({ width: 16, height: 16 })
  const tray = new Tray(icon)

  const runningCount = (): number =>
    ctx.store.listPrograms().filter((p) => {
      const s = ctx.processes.getRuntime(p.id).status
      return s === 'running' || s === 'starting'
    }).length

  const rebuild = (): void => {
    const menu = Menu.buildFromTemplate([
      { label: '창 열기', click: () => win.show() },
      { label: `실행 중: ${runningCount()}개`, enabled: false },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ])
    tray.setContextMenu(menu)
  }

  rebuild()
  ctx.processes.onRuntimeChange(rebuild)
  tray.on('click', () => win.show())
  return tray
}

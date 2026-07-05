import type { BrowserWindow, IpcMain } from 'electron'
import { app, shell, dialog } from 'electron'
import type { AppContext } from '../app-context'
import { startProgramWithPull } from '../start-program'
import type { Program } from '../../shared/types'

export function registerIpc(
  ipcMain: IpcMain,
  getWin: () => BrowserWindow | null,
  ctx: AppContext
): void {
  const { store, processes, logs, git } = ctx
  const notifyProgramsChanged = (): void => {
    for (const cb of ctx.programsChanged) cb()
  }
  // 창은 파괴/재생성될 수 있다 — 보낼 때마다 살아있는 창을 다시 조회한다.
  const send = (channel: string, payload: unknown): void => {
    getWin()?.webContents.send(channel, payload)
  }

  ipcMain.handle('programs:list', () => store.listPrograms())
  ipcMain.handle('programs:create', (_e, p: Omit<Program, 'id'>) => {
    const created = store.createProgram(p)
    notifyProgramsChanged()
    return created
  })
  ipcMain.handle('programs:update', (_e, p: Program) => {
    const updated = store.updateProgram(p)
    notifyProgramsChanged()
    return updated
  })
  ipcMain.handle('programs:delete', async (_e, id: string) => {
    // Deleting a running program must not leave its processes running as orphans.
    await processes.dispose(id)
    logs.clear(id)
    store.deleteProgram(id)
    notifyProgramsChanged()
  })
  ipcMain.handle('programs:import', (_e, json: string) => {
    const imported = store.importPrograms(json)
    notifyProgramsChanged()
    return imported
  })
  ipcMain.handle('programs:export', () => store.exportPrograms())

  ipcMain.handle('programs:start', async (_e, id: string) => {
    const program = store.listPrograms().find((p) => p.id === id)
    if (program) await startProgramWithPull(ctx, program)
  })
  ipcMain.handle('programs:stop', async (_e, id: string) => {
    await processes.stop(id)
  })
  ipcMain.handle('programs:restart', async (_e, id: string) => {
    const program = store.listPrograms().find((p) => p.id === id)
    if (program) await processes.restart(program)
  })
  ipcMain.handle('programs:open', async (_e, id: string) => {
    const target = processes.getRuntime(id).resolvedOpenTarget
    if (!target) return
    if (/^https?:\/\//.test(target)) await shell.openExternal(target)
    else await shell.openPath(target)
  })

  ipcMain.handle('runtime:list', () => store.listPrograms().map((p) => processes.getRuntime(p.id)))
  ipcMain.handle('logs:get', (_e, programId: string) => logs.get(programId))
  ipcMain.handle('logs:clear', (_e, programId: string) => logs.clear(programId))
  ipcMain.handle('logs:revealFile', (_e, programId: string) => {
    const path = logs.existingLogFile(programId)
    if (!path) return false
    shell.showItemInFolder(path)
    return true
  })

  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:set', (_e, s) => {
    const updated = store.setSettings(s)
    logs.setFileLogging(updated.logToFile)
    logs.setMaxLines(updated.logBufferLines)
    // dev 바이너리는 OS가 로그인 아이템 등록을 거부한다 — 패키징된 앱에서만
    if (app.isPackaged && process.platform !== 'linux') {
      app.setLoginItemSettings({ openAtLogin: updated.launchAtLogin })
    }
    return updated
  })

  ipcMain.handle(
    'git:clone',
    async (_e, req: { repoUrl: string; branch?: string; targetDir: string }) => {
      await git.clone(req, (line) => send('git:progress', { text: line }))
    }
  )

  ipcMain.handle('dialog:pickDirectory', async () => {
    const win = getWin()
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  processes.onRuntimeChange((rt) => send('runtime:changed', rt))
  logs.subscribe((lines) => send('logs:appended', lines))
  processes.onOpenRequested(async (_id, target) => {
    if (/^https?:\/\//.test(target)) await shell.openExternal(target)
    else await shell.openPath(target)
  })
}

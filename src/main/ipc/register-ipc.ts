import type { BrowserWindow, IpcMain } from 'electron'
import { app, shell, dialog } from 'electron'
import type { AppContext } from '../app-context'
import { startProgramWithPull } from '../start-program'
import type { Program } from '../../shared/types'

export function registerIpc(ipcMain: IpcMain, win: BrowserWindow, ctx: AppContext): void {
  const { store, processes, logs, git } = ctx
  const notifyProgramsChanged = (): void => {
    for (const cb of ctx.programsChanged) cb()
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
    if (process.platform !== 'linux') {
      app.setLoginItemSettings({ openAtLogin: updated.launchAtLogin })
    }
    return updated
  })

  ipcMain.handle(
    'git:clone',
    async (_e, req: { repoUrl: string; branch?: string; targetDir: string }) => {
      await git.clone(req, (line) => {
        if (!win.isDestroyed()) win.webContents.send('git:progress', { text: line })
      })
    }
  )

  ipcMain.handle('dialog:pickDirectory', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  processes.onRuntimeChange((rt) => {
    if (!win.isDestroyed()) win.webContents.send('runtime:changed', rt)
  })
  logs.subscribe((lines) => {
    if (!win.isDestroyed()) win.webContents.send('logs:appended', lines)
  })
  processes.onOpenRequested(async (_id, target) => {
    if (/^https?:\/\//.test(target)) await shell.openExternal(target)
    else await shell.openPath(target)
  })
}

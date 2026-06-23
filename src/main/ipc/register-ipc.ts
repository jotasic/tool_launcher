import type { BrowserWindow, IpcMain } from 'electron'
import { shell, dialog } from 'electron'
import type { AppContext } from '../app-context'
import type { Program } from '../../shared/types'

export function registerIpc(ipcMain: IpcMain, win: BrowserWindow, ctx: AppContext): void {
  const { store, processes, logs, git } = ctx

  ipcMain.handle('programs:list', () => store.listPrograms())
  ipcMain.handle('programs:create', (_e, p: Omit<Program, 'id'>) => store.createProgram(p))
  ipcMain.handle('programs:update', (_e, p: Program) => store.updateProgram(p))
  ipcMain.handle('programs:delete', (_e, id: string) => store.deleteProgram(id))
  ipcMain.handle('programs:import', (_e, json: string) => store.importPrograms(json))
  ipcMain.handle('programs:export', () => store.exportPrograms())

  ipcMain.handle('programs:start', async (_e, id: string) => {
    const program = store.listPrograms().find((p) => p.id === id)
    if (program) await processes.start(program)
  })
  ipcMain.handle('programs:stop', async (_e, id: string) => { await processes.stop(id) })
  ipcMain.handle('programs:open', async (_e, id: string) => {
    const target = processes.getRuntime(id).resolvedOpenTarget
    if (!target) return
    if (/^https?:\/\//.test(target)) await shell.openExternal(target)
    else await shell.openPath(target)
  })

  ipcMain.handle('runtime:list', () =>
    store.listPrograms().map((p) => processes.getRuntime(p.id)))
  ipcMain.handle('logs:get', (_e, programId: string) => logs.get(programId))

  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:set', (_e, s) => store.setSettings(s))

  ipcMain.handle('git:clone', async (_e, req: { repoUrl: string; branch?: string; targetDir: string }) => {
    await git.clone(req, (line) => {
      if (!win.isDestroyed()) win.webContents.send('git:progress', { text: line })
    })
  })

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

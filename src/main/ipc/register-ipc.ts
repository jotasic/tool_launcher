import type { BrowserWindow, IpcMain } from 'electron'
import { shell, dialog } from 'electron'
import type { AppContext } from '../app-context'
import type { Program } from '../../shared/types'

export function registerIpc(ipcMain: IpcMain, win: BrowserWindow, ctx: AppContext): void {
  const { store, processes, logs, git } = ctx

  ipcMain.handle('programs:list', () => store.listPrograms())
  ipcMain.handle('programs:create', (_e, p: Omit<Program, 'id'>) => store.createProgram(p))
  ipcMain.handle('programs:update', (_e, p: Program) => store.updateProgram(p))
  ipcMain.handle('programs:delete', async (_e, id: string) => {
    // Deleting a running program must not leave its processes running as orphans.
    await processes.dispose(id)
    logs.clear(id)
    store.deleteProgram(id)
  })
  ipcMain.handle('programs:import', (_e, json: string) => store.importPrograms(json))
  ipcMain.handle('programs:export', () => store.exportPrograms())

  ipcMain.handle('programs:start', async (_e, id: string) => {
    const program = store.listPrograms().find((p) => p.id === id)
    if (!program) return
    if (program.git?.autoPullOnStart) {
      // Surface pull output in the program's own log panel ('git:progress' is
      // only listened to while the clone dialog is open, so it was invisible here).
      const sys = (text: string): void =>
        logs.append({ programId: id, processName: 'git', stream: 'system', text, ts: Date.now() })
      sys('git pull 실행 중...')
      try {
        await git.pull(program.workingDir, sys)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        sys(`git pull 실패: ${msg} — 무시하고 시작합니다`)
      }
    }
    await processes.start(program)
  })
  ipcMain.handle('programs:stop', async (_e, id: string) => {
    await processes.stop(id)
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

import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createAppContext } from './app-context'
import type { AppContext } from './app-context'
import { registerIpc } from './ipc/register-ipc'
import { setupTray } from './tray'

// AppContext singleton — created once, shared across tray / IPC / before-quit
let appCtx: AppContext | null = null
let isQuitting = false

function getAppContext(): AppContext {
  if (!appCtx) {
    appCtx = createAppContext(app.getPath('userData'))
  }
  return appCtx
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const ctx = getAppContext()
  registerIpc(ipcMain, mainWindow, ctx)
  setupTray(mainWindow, ctx)

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS re-show the existing window when dock icon is clicked.
    // We do NOT call createWindow() again — the window is hidden, not destroyed.
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      wins[0]?.show()
    } else {
      createWindow()
    }
  })
})

// Keep app alive in tray — do NOT auto-quit when window is closed.
app.on('window-all-closed', () => {
  /* tray keeps app alive: do not quit */
})

app.on('before-quit', async (e) => {
  if (isQuitting) return
  e.preventDefault()
  isQuitting = true
  const ctx = appCtx
  if (ctx) {
    for (const p of ctx.store.listPrograms()) {
      const s = ctx.processes.getRuntime(p.id).status
      if (s === 'running' || s === 'starting') {
        await ctx.processes.stop(p.id)
      }
    }
  }
  app.quit()
})

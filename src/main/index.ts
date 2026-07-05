import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createAppContext } from './app-context'
import type { AppContext } from './app-context'
import { registerIpc } from './ipc/register-ipc'
import { startProgramWithPull } from './start-program'
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

// 창 크기·위치 기억: 마지막 상태를 저장해 다음 실행 때 복원한다.
function windowStateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): { width: number; height: number; x?: number; y?: number } {
  const fallback = { width: 900, height: 670 }
  try {
    const raw = JSON.parse(readFileSync(windowStateFile(), 'utf-8')) as Record<string, unknown>
    if (typeof raw.width === 'number' && typeof raw.height === 'number') {
      return { ...fallback, ...raw } as ReturnType<typeof loadWindowState>
    }
  } catch {
    // 첫 실행이거나 파일이 깨졌으면 기본값
  }
  return fallback
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    ...loadWindowState(),
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const ctx = getAppContext()
  registerIpc(ipcMain, mainWindow, ctx)
  setupTray(mainWindow, ctx)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const saveBounds = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        writeFileSync(windowStateFile(), JSON.stringify(mainWindow.getBounds()), 'utf-8')
      } catch {
        // 저장 실패해도 동작에는 지장 없음
      }
    }, 500)
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

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
    // Defense-in-depth: only hand off http(s) links to the OS browser; deny the rest.
    if (/^https?:\/\//.test(details.url)) shell.openExternal(details.url)
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
  // Set app user model id for windows (must match electron-builder appId)
  electronApp.setAppUserModelId('io.github.jotasic.toollauncher')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  const ctx = getAppContext()

  // 저장된 설정과 OS 로그인 아이템 상태 동기화
  if (process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: ctx.store.getSettings().launchAtLogin })
  }

  // '런처 시작 시 자동 시작' 프로그램들을 순서대로 켠다 (실패해도 나머지 진행)
  void (async () => {
    for (const p of ctx.store.listPrograms()) {
      if (!p.autoStartOnLaunch) continue
      try {
        await startProgramWithPull(ctx, p)
      } catch {
        // 개별 프로그램 시작 실패는 런타임 상태(error)로 표시된다
      }
    }
  })()

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

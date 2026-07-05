import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createAppContext } from './app-context'
import type { AppContext } from './app-context'
import { registerIpc } from './ipc/register-ipc'
import { startProgramWithPull } from './start-program'
import { setupTray } from './tray'

// AppContext singleton — created once, shared across tray / IPC / before-quit
let appCtx: AppContext | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false

function getAppContext(): AppContext {
  if (!appCtx) {
    appCtx = createAppContext(app.getPath('userData'))
  }
  return appCtx
}

// 트레이 상주 앱에서 uncaught 예외가 나면 Electron이 모달 에러 창을 띄운다.
// 대신 파일/콘솔에 기록하고 앱은 계속 살린다.
process.on('uncaughtException', (err) => {
  console.error('[main] uncaught exception:', err)
  try {
    appendFileSync(
      join(app.getPath('userData'), 'main-errors.log'),
      `[${new Date().toISOString()}] ${err.stack ?? String(err)}\n`,
      'utf-8'
    )
  } catch {
    // 로그 기록 실패는 무시
  }
})

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

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
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

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const saveBounds = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        if (!win.isDestroyed()) {
          writeFileSync(windowStateFile(), JSON.stringify(win.getBounds()), 'utf-8')
        }
      } catch {
        // 저장 실패해도 동작에는 지장 없음
      }
    }, 500)
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    // Defense-in-depth: only hand off http(s) links to the OS browser; deny the rest.
    if (/^https?:\/\//.test(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/**
 * 살아있는 창 핸들. 트레이 클릭 시점에 창이 이미 파괴됐으면 새로 만든다 —
 * 파괴된 객체에 show()를 부르면 main 프로세스가 통째로 죽는다
 * ("TypeError: Object has been destroyed").
 */
function liveWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function showWindow(): void {
  const win = liveWindow()
  if (win) {
    win.show()
    win.focus()
  } else if (!isQuitting) {
    mainWindow = createWindow()
  }
}

// 단일 인스턴스 보장: 중복 실행되면 트레이 아이콘이 2개 생기고, 죽은 인스턴스의
// 트레이가 남아 에러를 일으킨다. 두 번째 실행은 기존 창을 띄우고 즉시 종료.
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })

  app.whenReady().then(() => {
    // Set app user model id for windows (must match electron-builder appId)
    electronApp.setAppUserModelId('io.github.jotasic.toollauncher')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const ctx = getAppContext()
    mainWindow = createWindow()

    // IPC·트레이는 앱 수명 동안 딱 한 번 등록한다. 창은 파괴/재생성될 수 있으므로
    // 직접 참조 대신 liveWindow()/showWindow()를 넘긴다 (중복 핸들러 등록 방지).
    registerIpc(ipcMain, liveWindow, ctx)
    setupTray(showWindow, ctx)

    // 저장된 설정과 OS 로그인 아이템 상태 동기화
    // (dev 바이너리는 로그인 아이템 등록이 거부되므로 패키징된 앱에서만)
    if (!is.dev && process.platform !== 'linux') {
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

    app.on('activate', () => {
      // On macOS re-show the existing window when dock icon is clicked.
      showWindow()
    })
  })

  // Keep app alive in tray — do NOT auto-quit when window is closed.
  app.on('window-all-closed', () => {
    /* tray keeps app alive: do not quit */
  })

  app.on('before-quit', (e) => {
    if (isQuitting) return
    e.preventDefault()
    isQuitting = true
    // 종료는 반드시 끝나야 한다: 프로세스 정리가 걸려도(멈춘 자식 등) 데드라인에
    // app.exit()로 강제 종료 — 안 그러면 좀비 인스턴스가 트레이에 남는다.
    const finish = (): void => app.exit(0)
    const deadline = setTimeout(finish, 7000)
    void (async () => {
      try {
        const ctx = appCtx
        if (ctx) {
          await Promise.allSettled(
            ctx.store.listPrograms().map((p) => {
              const s = ctx.processes.getRuntime(p.id).status
              return s === 'running' || s === 'starting' ? ctx.processes.stop(p.id) : undefined
            })
          )
        }
      } finally {
        clearTimeout(deadline)
        finish()
      }
    })()
  })
}

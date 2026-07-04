// Dev utility: launch the REAL Electron runtime, load the built renderer + preload,
// and capture the rendered window to a PNG via webContents.capturePage().
// Used to visually verify the actual Electron UI without Screen Recording permission.
// Usage: TL_SHOT=/abs/path/shot.png ./node_modules/.bin/electron scripts/capture.cjs
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const OUT = process.env.TL_SHOT || path.join(root, 'electron-shot.png')
const RENDERER = path.join(root, 'out', 'renderer', 'index.html')
// TL_MOCK=1 loads a preload that serves fixture data (rows in every state)
// instead of the real IPC bridge, since this script registers no handlers.
const PRELOAD = process.env.TL_MOCK
  ? path.join(__dirname, 'capture-mock-preload.cjs')
  : path.join(root, 'out', 'preload', 'index.js')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    show: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false }
  })
  await win.loadFile(RENDERER)
  await new Promise((r) => setTimeout(r, 1500))
  // Optionally click a button (by visible text) to open a dialog before capture.
  const clickText = process.env.TL_CLICKTEXT
  if (clickText) {
    await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('button')]
        const want = ${JSON.stringify(clickText)}
        // exact match first so e.g. '로그' doesn't hit '프로그램 추가'
        const b =
          btns.find((x) => (x.textContent || '').trim() === want) ||
          btns.find((x) => (x.textContent || '').includes(want))
        if (b) { b.click(); return true }
        return false
      })()
    `)
    await new Promise((r) => setTimeout(r, 900))
  }
  // Optionally run arbitrary JS (e.g. open search and type a query) before capture.
  if (process.env.TL_JS) {
    const res = await win.webContents.executeJavaScript(`(async () => { ${process.env.TL_JS} })()`)
    if (res !== undefined) console.log('TL_JS ->', res)
    await new Promise((r) => setTimeout(r, 600))
  }
  const img = await win.webContents.capturePage()
  fs.writeFileSync(OUT, img.toPNG())
  console.log('captured to', OUT)
  app.quit()
})

app.on('window-all-closed', () => app.quit())

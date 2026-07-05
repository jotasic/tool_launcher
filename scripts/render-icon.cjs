// Dev utility: draw the app icon on a <canvas> inside Electron and save PNGs.
// (Electron이 곧 렌더러이므로 별도 이미지 라이브러리 없이 아이콘을 만든다)
// Usage: ./node_modules/.bin/electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')

// 앱 아이콘: 다크 타일 + 초록 플레이(=실행) 트라이앵글 + 터미널 언더스코어
const APP_ICON = `(() => {
  const S = 512
  const c = document.createElement('canvas'); c.width = S; c.height = S
  const x = c.getContext('2d')

  // rounded tile (macOS 스타일 여백/곡률)
  const inset = 40, r = 96
  const w = S - inset * 2
  const rr = (px, py, pw, ph, pr) => {
    x.beginPath()
    x.moveTo(px + pr, py)
    x.arcTo(px + pw, py, px + pw, py + ph, pr)
    x.arcTo(px + pw, py + ph, px, py + ph, pr)
    x.arcTo(px, py + ph, px, py, pr)
    x.arcTo(px, py, px + pw, py, pr)
    x.closePath()
  }
  const bg = x.createLinearGradient(inset, inset, S - inset, S - inset)
  bg.addColorStop(0, '#26364e')
  bg.addColorStop(1, '#0b1220')
  rr(inset, inset, w, w, r)
  x.fillStyle = bg
  x.fill()
  // 얇은 상단 하이라이트 테두리
  x.strokeStyle = 'rgba(148,163,184,0.35)'
  x.lineWidth = 4
  rr(inset + 2, inset + 2, w - 4, w - 4, r - 2)
  x.stroke()

  // play triangle (둥근 모서리: round join 두꺼운 stroke + fill)
  const cx = S / 2 + 14, cy = S / 2 - 22, t = 108
  const tri = () => {
    x.beginPath()
    x.moveTo(cx - t * 0.72, cy - t)
    x.lineTo(cx + t * 1.05, cy)
    x.lineTo(cx - t * 0.72, cy + t)
    x.closePath()
  }
  const tg = x.createLinearGradient(cx - t, cy - t, cx + t, cy + t)
  tg.addColorStop(0, '#4ade80')
  tg.addColorStop(1, '#16a34a')
  x.shadowColor = 'rgba(34,197,94,0.55)'
  x.shadowBlur = 42
  x.lineJoin = 'round'
  x.lineWidth = 56
  x.strokeStyle = tg
  tri(); x.stroke()
  x.shadowBlur = 0
  x.fillStyle = tg
  tri(); x.fill()

  // 터미널 프롬프트 언더스코어 (개발 도구 런처 뉘앙스)
  x.fillStyle = 'rgba(226,232,240,0.92)'
  rr(S / 2 - 92, S - inset - 96, 184, 26, 13)
  x.fill()

  return c.toDataURL('image/png')
})()`

// 트레이 아이콘: 배경 없는 고대비 글리프 (16px로 줄여도 보이게 단순하게)
const TRAY_ICON = `(() => {
  const S = 512
  const c = document.createElement('canvas'); c.width = S; c.height = S
  const x = c.getContext('2d')
  const cx = S / 2 + 20, cy = S / 2, t = 170
  const tri = () => {
    x.beginPath()
    x.moveTo(cx - t * 0.72, cy - t)
    x.lineTo(cx + t * 1.05, cy)
    x.lineTo(cx - t * 0.72, cy + t)
    x.closePath()
  }
  // 다크/라이트 메뉴바 모두에서 보이게 어두운 외곽선 + 밝은 초록
  x.lineJoin = 'round'
  x.lineWidth = 120
  x.strokeStyle = 'rgba(2,6,23,0.9)'
  tri(); x.stroke()
  x.lineWidth = 84
  x.strokeStyle = '#22c55e'
  tri(); x.stroke()
  x.fillStyle = '#22c55e'
  tri(); x.fill()
  return c.toDataURL('image/png')
})()`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 600, height: 600 })
  await win.loadURL('about:blank')
  const save = async (js, file) => {
    const dataUrl = await win.webContents.executeJavaScript(js)
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log('wrote', file)
  }
  await save(APP_ICON, path.join(root, 'resources', 'icon.png'))
  await save(APP_ICON, path.join(root, 'build', 'icon.png'))
  await save(TRAY_ICON, path.join(root, 'resources', 'tray-icon.png'))
  app.quit()
})

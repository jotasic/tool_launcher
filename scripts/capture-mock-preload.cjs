// Dev utility: mock window.api with fixture data so capture.cjs can screenshot
// realistic UI states (running/stopped/error rows, logs) without spawning anything.
// Used via: TL_MOCK=1 [TL_THEME=dark] ./node_modules/.bin/electron scripts/capture.cjs
const { contextBridge } = require('electron')

const THEME = process.env.TL_THEME || 'light'

const programs = [
  {
    id: 'p1',
    name: 'FastAPI + React 대시보드',
    workingDir: '/Users/me/dev/dashboard',
    processes: [
      { name: 'backend', command: 'python', args: ['-m', 'uvicorn', 'main:app'], order: 0 },
      { name: 'frontend', command: 'npm', args: ['run', 'dev'], order: 1 }
    ],
    open: { mode: 'url-from-log', logProcessName: 'frontend', autoOpenOnStart: false }
  },
  {
    id: 'p2',
    name: 'Qt 이미지 뷰어',
    workingDir: '/Users/me/dev/viewer',
    processes: [{ name: 'app', command: 'python', args: ['main.py'], order: 0 }],
    open: { mode: 'none', autoOpenOnStart: false }
  },
  {
    id: 'p3',
    name: '크롤러 (죽는 예제)',
    workingDir: '/Users/me/dev/crawler',
    processes: [{ name: 'worker', command: 'pythn', args: ['run.py'], order: 0 }],
    open: { mode: 'none', autoOpenOnStart: false }
  }
]

const runtimes = [
  { programId: 'p1', status: 'running', resolvedOpenTarget: 'http://localhost:5173' },
  { programId: 'p2', status: 'stopped' },
  { programId: 'p3', status: 'error', error: 'process worker failed to start: spawn pythn ENOENT' }
]

const E = String.fromCharCode(27) // ESC
// 실제 uvicorn/vite가 찍는 것과 같은 ANSI 컬러 로그 (색 렌더링 검증용)
const logs = [
  { programId: 'p1', processName: 'backend', stream: 'stdout', text: `${E}[32mINFO${E}[0m:     Uvicorn running on ${E}[1mhttp://127.0.0.1:8000${E}[0m (Press CTRL+C to quit)`, ts: 0 },
  { programId: 'p1', processName: 'backend', stream: 'stdout', text: `${E}[32mINFO${E}[0m:     Application startup complete.`, ts: 0 },
  { programId: 'p1', processName: 'backend', stream: 'stderr', text: `${E}[33mWARNING${E}[0m:  StatReload detected changes in 'main.py'. Reloading...`, ts: 0 },
  { programId: 'p1', processName: 'backend', stream: 'stderr', text: `${E}[31mERROR${E}[0m:    Exception in ASGI application`, ts: 0 },
  { programId: 'p1', processName: 'frontend', stream: 'stdout', text: `${E}[36m  VITE v5.4.2${E}[39m  ${E}[32mready in 312 ms${E}[39m`, ts: 0 },
  { programId: 'p1', processName: 'frontend', stream: 'stdout', text: `  ${E}[32m➜${E}[39m  ${E}[1mLocal${E}[22m:   ${E}[36mhttp://localhost:${E}[1m5173${E}[22m/${E}[39m`, ts: 0 },
  { programId: 'p1', processName: 'frontend', stream: 'stdout', text: `${E}[38;5;208m256색 예제${E}[0m 그리고 ${E}[38;2;120;180;255m트루컬러${E}[0m 텍스트`, ts: 0 },
  { programId: 'p1', processName: 'git', stream: 'system', text: 'git pull 실행 중...', ts: 0 },
  { programId: 'p1', processName: 'git', stream: 'system', text: 'Already up to date.', ts: 0 }
]

const api = {
  invoke: async (channel) => {
    switch (channel) {
      case 'programs:list':
        return programs
      case 'runtime:list':
        return runtimes
      case 'settings:get':
        return {
          logBufferLines: 2000,
          logToFile: false,
          defaultLogPattern: 'https?://[^\\s]+',
          theme: THEME
        }
      case 'logs:get':
        return logs
      default:
        return undefined
    }
  },
  on: () => () => {}
}

contextBridge.exposeInMainWorld('api', api)

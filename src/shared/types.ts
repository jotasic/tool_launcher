export type OpenMode = 'none' | 'url' | 'url-from-log' | 'path'

export interface OpenSpec {
  mode: OpenMode
  value?: string
  logPattern?: string
  /** For url-from-log: only scan this process's output. Empty = all processes. */
  logProcessName?: string
  autoOpenOnStart: boolean
}

export interface ProcessSpec {
  name: string
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  order: number
  startDelayMs?: number
}

export interface GitSpec {
  repoUrl: string
  branch?: string
  autoPullOnStart?: boolean
}

export interface Program {
  id: string
  name: string
  workingDir: string
  git?: GitSpec
  processes: ProcessSpec[]
  open?: OpenSpec
  /** 크래시 시 자동 재시작 (지수 백오프, 최대 5회 — 60초 이상 살아있으면 카운터 리셋) */
  autoRestart?: boolean
  /** 런처가 켜질 때 이 프로그램도 자동 시작 */
  autoStartOnLaunch?: boolean
}

export type ProgramStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface ProgramRuntime {
  programId: string
  status: ProgramStatus
  resolvedOpenTarget?: string
  error?: string
  /** running 상태가 된 시각 (업타임 표시용) */
  startedAt?: number
}

export interface LogLine {
  programId: string
  processName: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  ts: number
}

export interface UpdateInfo {
  current: string
  latest: string
  url: string
  hasUpdate: boolean
}

export interface Settings {
  logBufferLines: number
  logToFile: boolean
  defaultLogPattern: string
  theme: 'light' | 'dark' | 'system'
  /** OS 로그인 시 런처 자동 실행 */
  launchAtLogin: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  logBufferLines: 2000,
  logToFile: false,
  defaultLogPattern: 'https?://[^\\s]+',
  theme: 'system',
  launchAtLogin: false
}

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
}

export type ProgramStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface ProgramRuntime {
  programId: string
  status: ProgramStatus
  resolvedOpenTarget?: string
  error?: string
}

export interface LogLine {
  programId: string
  processName: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
  ts: number
}

export interface Settings {
  logBufferLines: number
  logToFile: boolean
  defaultLogPattern: string
  theme: 'light' | 'dark' | 'system'
}

export const DEFAULT_SETTINGS: Settings = {
  logBufferLines: 2000,
  logToFile: false,
  defaultLogPattern: 'https?://[^\\s]+',
  theme: 'system'
}

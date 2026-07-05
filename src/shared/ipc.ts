import type { Program, ProgramRuntime, LogLine, Settings, UpdateInfo } from './types'

// invoke: renderer가 호출하고 main이 응답(Promise)
export interface IpcApi {
  'programs:list': () => Promise<Program[]>
  'programs:create': (p: Omit<Program, 'id'>) => Promise<Program>
  'programs:update': (p: Program) => Promise<Program>
  'programs:delete': (id: string) => Promise<void>
  'programs:start': (id: string) => Promise<void>
  'programs:stop': (id: string) => Promise<void>
  'programs:restart': (id: string) => Promise<void>
  'programs:open': (id: string) => Promise<void>
  'programs:import': (json: string) => Promise<Program[]>
  'programs:export': () => Promise<string>
  'runtime:list': () => Promise<ProgramRuntime[]>
  'logs:get': (programId: string) => Promise<LogLine[]>
  'logs:clear': (programId: string) => Promise<void>
  /** 로그 파일을 파일 탐색기에서 보여준다. 파일이 없으면 false. */
  'logs:revealFile': (programId: string) => Promise<boolean>
  'settings:get': () => Promise<Settings>
  'settings:set': (s: Settings) => Promise<Settings>
  'dialog:pickDirectory': () => Promise<string | null>
  'git:clone': (req: { repoUrl: string; branch?: string; targetDir: string }) => Promise<void>
  /** GitHub 최신 릴리즈 확인 (실패 시 null) */
  'update:check': () => Promise<UpdateInfo | null>
  /** 릴리즈 페이지 열기 (github.com URL만 허용) */
  'update:openDownload': (url: string) => Promise<void>
}

// event: main이 renderer로 푸시
export interface IpcEvents {
  'runtime:changed': ProgramRuntime
  'logs:appended': LogLine[]
  'git:progress': { text: string }
}

export const INVOKE_CHANNELS = [
  'programs:list',
  'programs:create',
  'programs:update',
  'programs:delete',
  'programs:start',
  'programs:stop',
  'programs:restart',
  'programs:open',
  'programs:import',
  'programs:export',
  'runtime:list',
  'logs:get',
  'logs:clear',
  'logs:revealFile',
  'settings:get',
  'settings:set',
  'dialog:pickDirectory',
  'git:clone',
  'update:check',
  'update:openDownload'
] as const satisfies ReadonlyArray<keyof IpcApi>

export const EVENT_CHANNELS = [
  'runtime:changed',
  'logs:appended',
  'git:progress'
] as const satisfies ReadonlyArray<keyof IpcEvents>

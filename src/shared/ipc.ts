import type { Program, ProgramRuntime, LogLine, Settings } from './types'

// invoke: renderer가 호출하고 main이 응답(Promise)
export interface IpcApi {
  'programs:list': () => Promise<Program[]>
  'programs:create': (p: Omit<Program, 'id'>) => Promise<Program>
  'programs:update': (p: Program) => Promise<Program>
  'programs:delete': (id: string) => Promise<void>
  'programs:start': (id: string) => Promise<void>
  'programs:stop': (id: string) => Promise<void>
  'programs:open': (id: string) => Promise<void>
  'programs:import': (json: string) => Promise<Program[]>
  'programs:export': () => Promise<string>
  'runtime:list': () => Promise<ProgramRuntime[]>
  'logs:get': (programId: string) => Promise<LogLine[]>
  'settings:get': () => Promise<Settings>
  'settings:set': (s: Settings) => Promise<Settings>
  'dialog:pickDirectory': () => Promise<string | null>
}

// event: main이 renderer로 푸시
export interface IpcEvents {
  'runtime:changed': ProgramRuntime
  'logs:appended': LogLine[]
}

export const INVOKE_CHANNELS = [
  'programs:list', 'programs:create', 'programs:update', 'programs:delete',
  'programs:start', 'programs:stop', 'programs:open',
  'programs:import', 'programs:export',
  'runtime:list', 'logs:get',
  'settings:get', 'settings:set', 'dialog:pickDirectory',
] as const satisfies ReadonlyArray<keyof IpcApi>

export const EVENT_CHANNELS = [
  'runtime:changed', 'logs:appended',
] as const satisfies ReadonlyArray<keyof IpcEvents>

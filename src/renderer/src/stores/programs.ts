import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Program, ProgramRuntime } from '../../../shared/types'

interface ProgramsState {
  programs: Program[]
  runtimes: Record<string, ProgramRuntime>
  load: () => Promise<void>
  applyRuntime: (rt: ProgramRuntime) => void
  create: (p: Omit<Program, 'id'>) => Promise<void>
  update: (p: Program) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProgramsStore = create<ProgramsState>((set, get) => ({
  programs: [],
  runtimes: {},
  load: async () => {
    const [programs, runtimeList] = await Promise.all([
      ipc.invoke('programs:list'),
      ipc.invoke('runtime:list'),
    ])
    const runtimes: Record<string, ProgramRuntime> = {}
    for (const rt of runtimeList ?? []) runtimes[rt.programId] = rt
    set({ programs: programs ?? [], runtimes })
  },
  applyRuntime: (rt) =>
    set((s) => ({ runtimes: { ...s.runtimes, [rt.programId]: rt } })),
  create: async (p) => { await ipc.invoke('programs:create', p); await get().load() },
  update: async (p) => { await ipc.invoke('programs:update', p); await get().load() },
  remove: async (id) => { await ipc.invoke('programs:delete', id); await get().load() },
}))

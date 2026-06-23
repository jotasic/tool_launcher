import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Program, ProgramRuntime } from '../../../shared/types'

interface ProgramsState {
  programs: Program[]
  runtimes: Record<string, ProgramRuntime>
  load: () => Promise<void>
  applyRuntime: (rt: ProgramRuntime) => void
}

export const useProgramsStore = create<ProgramsState>((set) => ({
  programs: [],
  runtimes: {},
  load: async () => {
    const [programs, runtimeList] = await Promise.all([
      ipc.invoke('programs:list'),
      ipc.invoke('runtime:list'),
    ])
    const runtimes: Record<string, ProgramRuntime> = {}
    for (const rt of runtimeList) runtimes[rt.programId] = rt
    set({ programs, runtimes })
  },
  applyRuntime: (rt) =>
    set((s) => ({ runtimes: { ...s.runtimes, [rt.programId]: rt } })),
}))

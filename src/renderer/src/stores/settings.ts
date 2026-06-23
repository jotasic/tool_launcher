import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Settings } from '../../../shared/types'

interface SettingsState {
  settings: Settings | null
  load: () => Promise<void>
  save: (s: Settings) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  load: async () => set({ settings: await ipc.invoke('settings:get') }),
  save: async (s) => set({ settings: await ipc.invoke('settings:set', s) }),
}))

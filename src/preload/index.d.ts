import { ElectronAPI } from '@electron-toolkit/preload'
import type { IpcApi, IpcEvents } from '../shared/ipc'

export interface ExposedApi {
  invoke<K extends keyof IpcApi>(channel: K, ...args: Parameters<IpcApi[K]>): ReturnType<IpcApi[K]>
  on<K extends keyof IpcEvents>(channel: K, cb: (payload: IpcEvents[K]) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ExposedApi
  }
}

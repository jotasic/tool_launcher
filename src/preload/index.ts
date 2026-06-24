import { contextBridge, ipcRenderer } from 'electron'
import { INVOKE_CHANNELS, EVENT_CHANNELS } from '../shared/ipc'
import type { IpcApi, IpcEvents } from '../shared/ipc'

const api = {
  invoke: (channel: keyof IpcApi, ...args: unknown[]) => {
    if (!INVOKE_CHANNELS.includes(channel)) throw new Error(`blocked invoke: ${channel}`)
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: keyof IpcEvents, cb: (payload: unknown) => void) => {
    if (!EVENT_CHANNELS.includes(channel)) throw new Error(`blocked event: ${channel}`)
    const listener = (_e: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

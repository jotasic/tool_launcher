import { Store } from './core/store'
import { LogStore } from './core/log-store'
import { ProcessManager } from './core/process-manager'
import { createRealDeps } from './core/real-deps'

export interface AppContext {
  store: Store
  logs: LogStore
  processes: ProcessManager
}

export function createAppContext(userDataDir: string): AppContext {
  const store = new Store(userDataDir)
  const settings = store.getSettings()
  const logs = new LogStore(settings.logBufferLines)
  const processes = new ProcessManager(logs, createRealDeps())
  return { store, logs, processes }
}

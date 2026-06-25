import { join } from 'node:path'
import { Store } from './core/store'
import { LogStore } from './core/log-store'
import { ProcessManager } from './core/process-manager'
import { createRealDeps } from './core/real-deps'
import { GitService, createGitRunner } from './core/git-service'

export interface AppContext {
  store: Store
  logs: LogStore
  processes: ProcessManager
  git: GitService
}

export function createAppContext(userDataDir: string): AppContext {
  const store = new Store(userDataDir)
  const settings = store.getSettings()
  const logs = new LogStore(settings.logBufferLines, { logDir: join(userDataDir, 'logs') })
  logs.setFileLogging(settings.logToFile)
  const processes = new ProcessManager(logs, createRealDeps())
  const git = new GitService(createGitRunner())
  return { store, logs, processes, git }
}

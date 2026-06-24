// Typed IPC client. In the Electron renderer, `window.api` is exposed by the
// preload bridge. If it is ever missing (preload not loaded, or running the
// renderer in a plain browser for testing), fall back to a no-op so the UI
// still renders instead of throwing a white screen.
const fallback = {
  invoke: async () => undefined,
  on: () => () => {}
} as unknown as typeof window.api

export const ipc: typeof window.api =
  typeof window !== 'undefined' && window.api
    ? window.api
    : (console.warn('[ipc] window.api unavailable — using no-op fallback (preload not loaded?)'),
      fallback)

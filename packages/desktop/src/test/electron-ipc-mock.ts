// Shared electron ipc state for tests.
// bun's mock.module is process-global, so test files that mock electron must share this mutable
// state; otherwise one file's ipcRenderer mock clobbers another file's ipcRenderer or ipcMain.
export const electronIpc = {
  invoke: (_channel: string, ..._args: unknown[]) => Promise.resolve(null),
  registered: new Map<string, (...args: unknown[]) => unknown>(),
}

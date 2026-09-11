// IPC request/response correlation.
// The preload attaches a unique request ID as the first argument of every invoke call.
// This wraps handlers so that ID is logged with the request and response, letting a single
// ID trace a call across processes. Duplicate requests (an ID already in flight) are flagged.

import { ipcMain } from "electron"
import { write as writeLog } from "./logging"

type InvokeHandler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>

// Request IDs currently being processed, used to detect duplicates. Bounded by concurrency
// because each ID is removed once its response is logged.
const inFlight = new Set<string>()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function correlateHandler(channel: string, handler: InvokeHandler) {
  return async (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    const [requestIdArg, ...rest] = args
    const requestId = requestIdArg === undefined ? undefined : String(requestIdArg)

    if (requestId !== undefined && inFlight.has(requestId)) {
      writeLog("main", "ipc-duplicate-request", { channel, requestId }, "warn")
    }
    if (requestId !== undefined) inFlight.add(requestId)
    writeLog("main", "ipc-request", { channel, requestId })

    try {
      const result = await handler(event, ...rest)
      if (requestId !== undefined) inFlight.delete(requestId)
      writeLog("main", "ipc-response", { channel, requestId })
      return result
    } catch (error) {
      if (requestId !== undefined) inFlight.delete(requestId)
      writeLog("main", "ipc-error", { channel, requestId, error: errorMessage(error) }, "error")
      throw error
    }
  }
}

let enabled = false

// Wrap ipcMain.handle once so every handler registered afterwards is correlated.
export function enableIpcCorrelation(): void {
  if (enabled) return
  enabled = true
  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, handler: InvokeHandler) =>
    originalHandle(channel, correlateHandler(channel, handler))) as typeof ipcMain.handle
}

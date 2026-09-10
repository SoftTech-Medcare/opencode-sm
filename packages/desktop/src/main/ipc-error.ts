// IPC error handling utilities for consistent error reporting across the desktop app.
// Wraps IPC handlers to automatically catch errors, log them, and return structured
// error objects to the caller.

import { ipcMain } from "electron"
import { write as writeLog } from "./logging"

interface IpcResult<T> {
  ok: true
  data: T
}

interface IpcError {
  ok: false
  error: {
    code?: string
    message: string
  }
}

export type IpcResponse<T> = IpcResult<T> | IpcError

// Wrap an async IPC handler with consistent error handling
export function handleIpc(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>,
) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const result = await handler(event, ...args)
      return { ok: true, data: result }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      writeLog("main", `IPC error on ${channel}: ${message}`)
      return {
        ok: false,
        error: {
          message,
        },
      }
    }
  })
}

// Wrap a sync IPC handler with consistent error handling
export function handleIpcSync(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown,
) {
  ipcMain.handle(channel, (event, ...args) => {
    try {
      const result = handler(event, ...args)
      return { ok: true, data: result }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      writeLog("main", `IPC sync error on ${channel}: ${message}`)
      return {
        ok: false,
        error: {
          message,
        },
      }
    }
  })
}
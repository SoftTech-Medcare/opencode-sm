import { ipcRenderer } from "electron"

export class IpcTimeoutError extends Error {
  constructor(channel: string, timeout: number) {
    super(`IPC call to "${channel}" timed out after ${timeout}ms`)
    this.name = "IpcTimeoutError"
  }
}

/**
 * Invoke an IPC handler with a timeout.
 * @param channel The IPC channel name
 * @param args Arguments to pass to the handler
 * @param timeout Timeout in milliseconds (default: 30000)
 * @returns Promise with the result
 */
export function invokeWithTimeout(channel: string, args?: unknown[], timeout = 30000): Promise<unknown> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new IpcTimeoutError(channel, timeout)), timeout)
  })

  const invokePromise = args ? ipcRenderer.invoke(channel, ...args) : ipcRenderer.invoke(channel)

  return Promise.race([invokePromise, timeoutPromise])
}

/**
 * Send an IPC message with a response timeout.
 * @param channel The IPC channel name
 * @param args Arguments to pass
 * @param timeout Timeout in milliseconds (default: 30000)
 * @returns Promise with the response
 */
export function sendWithTimeout(channel: string, args?: unknown[], timeout = 30000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      ipcRenderer.removeListener("ipc-response", handler)
      reject(new IpcTimeoutError(channel, timeout))
    }, timeout)

    const handler = (_event: unknown, result: unknown) => {
      clearTimeout(timeoutId)
      resolve(result)
    }

    ipcRenderer.once("ipc-response", handler)
    if (args) {
      ipcRenderer.send(channel, ...args)
    } else {
      ipcRenderer.send(channel)
    }
  })
}
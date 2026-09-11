import { ipcRenderer } from "electron"

export class IpcTimeoutError extends Error {
  readonly isIpcTimeout = true
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
export function invokeWithTimeout<T = unknown>(channel: string, args?: unknown[], timeout = 30000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IpcTimeoutError(channel, timeout)), timeout)
  })

  const invokePromise = args
    ? (ipcRenderer.invoke(channel, ...args) as Promise<T>)
    : (ipcRenderer.invoke(channel) as Promise<T>)

  return Promise.race([invokePromise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

const RETRY_ATTEMPTS = 3
const RETRY_BASE_DELAY = 250
const RETRY_MAX_DELAY = 5000

function isTransientIpcError(error: unknown): boolean {
  return error instanceof Error && (error as IpcTimeoutError).isIpcTimeout === true
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry an async operation while it fails with a transient error (an IPC timeout),
 * backing off between attempts. Non-transient errors are rethrown immediately.
 * @param fn The operation to run
 * @param attempts Total number of attempts allowed (default: 3)
 */
export async function retry<T>(fn: () => Promise<T>, attempts = RETRY_ATTEMPTS): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (attempts <= 1 || !isTransientIpcError(error)) throw error
    await delay(Math.min(RETRY_MAX_DELAY, RETRY_BASE_DELAY * 2 ** (RETRY_ATTEMPTS - attempts)))
    return retry(fn, attempts - 1)
  }
}

export function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return retry(() => invokeWithTimeout<T>(channel, args))
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
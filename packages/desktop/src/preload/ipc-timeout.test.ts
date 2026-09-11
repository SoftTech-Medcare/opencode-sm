import { describe, expect, mock, test } from "bun:test"
import { electronIpc } from "../test/electron-ipc-mock"

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = (value: T) => res(value)
    reject = (error?: unknown) => rej(error)
  })
  return { promise, resolve, reject }
}

mock.module("electron", () => ({
  default: { app: { getPath: () => "/tmp/opencode-desktop-test" } },
  ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => electronIpc.invoke(channel, ...args) },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => electronIpc.registered.set(channel, handler) },
}))

describe("IpcTimeoutError", () => {
  test("carries channel and timeout in name and message", async () => {
    const { IpcTimeoutError } = await import("./ipc-timeout")
    const error = new IpcTimeoutError("test-channel", 1234)
    expect(error.name).toBe("IpcTimeoutError")
    expect(error.message).toContain("test-channel")
    expect(error.message).toContain("1234")
  })
})

describe("invoke", () => {
  test("attaches a request id before the channel args", async () => {
    const received: unknown[][] = []
    electronIpc.invoke = (channel, ...args) => {
      received.push([channel, ...args])
      return Promise.resolve("ok")
    }
    const { invoke } = await import("./ipc-timeout")
    expect(await invoke("chan", 1, "two")).toBe("ok")
    expect(received).toHaveLength(1)
    expect(received[0][0]).toBe("chan")
    expect(typeof received[0][1]).toBe("string")
    expect(received[0].slice(2)).toEqual([1, "two"])
  })
})

describe("invokeWithTimeout", () => {
  test("resolves with the handler result before the timeout", async () => {
    const result = deferred<string>()
    electronIpc.invoke = () => result.promise
    const { invokeWithTimeout } = await import("./ipc-timeout")
    const promise = invokeWithTimeout("test", ["value"], 1000)
    result.resolve("ok")
    expect(await promise).toBe("ok")
  })

  test("rejects with IpcTimeoutError when the handler hangs past the timeout", async () => {
    const { IpcTimeoutError, invokeWithTimeout } = await import("./ipc-timeout")
    const hang = deferred<unknown>()
    electronIpc.invoke = () => hang.promise
    const start = Date.now()
    const promise = invokeWithTimeout("slow", [], 40)
    await expect(promise).rejects.toBeInstanceOf(IpcTimeoutError)
    expect(Date.now() - start).toBeGreaterThanOrEqual(30)
    hang.resolve("late")
  })

  test("clears its timer once the handler resolves", async () => {
    const result = deferred<string>()
    electronIpc.invoke = () => result.promise
    const { invokeWithTimeout } = await import("./ipc-timeout")
    const promise = invokeWithTimeout("fast", [], 1000)
    result.resolve("done")
    expect(await promise).toBe("done")
  })
})

describe("retry", () => {
  test("succeeds after a transient timeout", async () => {
    const { retry, IpcTimeoutError } = await import("./ipc-timeout")
    let calls = 0
    const fn = async () => {
      calls += 1
      if (calls === 1) throw new IpcTimeoutError("chan", 100)
      return "ok"
    }
    expect(await retry(fn)).toBe("ok")
    expect(calls).toBe(2)
  })

  test("gives up after the attempt limit and throws the last timeout", async () => {
    const { retry, IpcTimeoutError } = await import("./ipc-timeout")
    let calls = 0
    const fn = async () => {
      calls += 1
      throw new IpcTimeoutError("chan", 100)
    }
    await expect(retry(fn, 3)).rejects.toBeInstanceOf(IpcTimeoutError)
    expect(calls).toBe(3)
  })

  test("rethrows non-transient errors without retrying", async () => {
    const { retry } = await import("./ipc-timeout")
    let calls = 0
    const fn = async () => {
      calls += 1
      throw new Error("boom")
    }
    await expect(retry(fn)).rejects.toThrow("boom")
    expect(calls).toBe(1)
  })

  test("invoke retries on timeout then resolves", async () => {
    const first = deferred<unknown>()
    const second = deferred<string>()
    let n = 0
    electronIpc.invoke = () => {
      n += 1
      return n === 1 ? first.promise : second.promise
    }
    second.resolve("done")
    const { invoke, IpcTimeoutError } = await import("./ipc-timeout")
    const promise = invoke("chan")
    first.reject(new IpcTimeoutError("chan", 40))
    expect(await promise).toBe("done")
    expect(n).toBe(2)
  })
})

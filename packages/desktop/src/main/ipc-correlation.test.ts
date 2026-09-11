import { describe, expect, mock, test } from "bun:test"
import type { IpcMainInvokeEvent } from "electron"
import { electronIpc } from "../test/electron-ipc-mock"

const event = {} as unknown as IpcMainInvokeEvent

const logs: Array<[string, unknown]> = []
const write = mock((_name: string, message: string, extra?: unknown) => {
  logs.push([message, extra])
})
mock.module("./logging", () => ({ write }))

mock.module("electron", () => ({
  default: { app: { getPath: () => "/tmp/opencode-desktop-test" } },
  ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => electronIpc.invoke(channel, ...args) },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => electronIpc.registered.set(channel, handler) },
}))

describe("correlateHandler", () => {
  test("strips the request id and passes the rest to the handler", async () => {
    const { correlateHandler } = await import("./ipc-correlation")
    const seen: unknown[][] = []
    const wrapped = correlateHandler("chan", async (_e: unknown, ...args: unknown[]) => {
      seen.push(args)
      return "ok"
    })
    expect(await wrapped(event, "req-1", "a", "b")).toBe("ok")
    expect(seen).toEqual([["a", "b"]])
  })

  test("passes arguments through when no request id is attached", async () => {
    const { correlateHandler } = await import("./ipc-correlation")
    const seen: unknown[][] = []
    const wrapped = correlateHandler("chan", async (_e: unknown, ...args: unknown[]) => {
      seen.push(args)
      return "ok"
    })
    expect(await wrapped(event, undefined, "a", "b")).toBe("ok")
    expect(seen).toEqual([["a", "b"]])
  })

  test("rethrows the handler error", async () => {
    const { correlateHandler } = await import("./ipc-correlation")
    const wrapped = correlateHandler("chan", async () => {
      throw new Error("boom")
    })
    await expect(wrapped(event, "req-1")).rejects.toThrow("boom")
  })

  test("flags a request id that is already in flight", async () => {
    const { correlateHandler } = await import("./ipc-correlation")
    let resolveFirst: () => void = () => undefined
    const pending = new Promise((resolve) => {
      resolveFirst = () => resolve("ok")
    })
    const wrapped = correlateHandler("chan", async () => pending)
    const first = wrapped(event, "dup", 1)
    const second = wrapped(event, "dup", 2)
    expect(
      logs.some(([message, extra]) => message === "ipc-duplicate-request" && (extra as { requestId?: string })?.requestId === "dup"),
    ).toBe(true)
    resolveFirst()
    await Promise.all([first, second])
  })
})

describe("enableIpcCorrelation", () => {
  test("wraps handlers registered after enabling", async () => {
    const { enableIpcCorrelation } = await import("./ipc-correlation")
    enableIpcCorrelation()
    const seen: unknown[][] = []
    const core = async (_e: unknown, ...args: unknown[]) => {
      seen.push(args)
      return "ok"
    }
    const { ipcMain } = await import("electron")
    ipcMain.handle("chan", core)
    const wrapped = electronIpc.registered.get("chan")
    if (!wrapped) throw new Error("handler not registered")
    expect(await wrapped(event, "req-1", "a", "b")).toBe("ok")
    expect(seen).toEqual([["a", "b"]])
  })
})

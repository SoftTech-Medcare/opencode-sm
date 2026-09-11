import { describe, expect, test } from "bun:test"
import {
  createSidecarManager,
  SIDECAR_MAX_RESTARTS,
  SIDECAR_RESTART_BASE_DELAY,
  type SidecarSession,
} from "./sidecar-manager"

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

async function waitFor(predicate: () => boolean, timeout = 1000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("waitFor timed out")
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

function session(input: { startup?: "ready" | "down"; onBad?: Promise<void> } = {}): SidecarSession {
  return {
    startup: Promise.resolve(input.startup ?? "ready"),
    onBad: input.onBad ?? new Promise<void>(() => undefined),
    stop: () => Promise.resolve(),
  }
}

describe("createSidecarManager", () => {
  test("restarts with exponential backoff and exhausts after the limit", async () => {
    const restarts: number[] = []
    const delays: number[] = []
    let spawnCount = 0

    const manager = createSidecarManager({
      spawn: () => {
        spawnCount += 1
        return Promise.resolve(session({ startup: "down" }))
      },
      delay: (ms) => {
        delays.push(ms)
        return Promise.resolve()
      },
      onRestart: (attempt) => {
        restarts.push(attempt)
      },
      onExhausted: () => undefined,
      log: () => undefined,
    })

    await waitFor(() => spawnCount === SIDECAR_MAX_RESTARTS + 1)
    await manager.stop()

    expect(restarts).toEqual([1, 2, 3, 4, 5])
    expect(delays).toEqual([
      SIDECAR_RESTART_BASE_DELAY,
      SIDECAR_RESTART_BASE_DELAY * 2,
      SIDECAR_RESTART_BASE_DELAY * 4,
      SIDECAR_RESTART_BASE_DELAY * 8,
      SIDECAR_RESTART_BASE_DELAY * 16,
    ])
    expect(spawnCount).toBe(SIDECAR_MAX_RESTARTS + 1)
  })

  test("notifies exhaustion when spawn keeps throwing", async () => {
    let exhausted = false
    let spawnCount = 0

    const manager = createSidecarManager({
      spawn: () => {
        spawnCount += 1
        return Promise.reject(new Error("spawn boom"))
      },
      delay: () => Promise.resolve(),
      onRestart: () => undefined,
      onExhausted: () => {
        exhausted = true
      },
      log: () => undefined,
    })

    await waitFor(() => exhausted)
    await manager.stop()

    expect(spawnCount).toBe(SIDECAR_MAX_RESTARTS + 1)
  })

  test("resets the failure counter after a stable session", async () => {
    const restarts: number[] = []
    const pending: Array<{ startup: Deferred<"ready" | "down">; onBad: Deferred<void> }> = []

    const manager = createSidecarManager({
      spawn: () => {
        const startup = deferred<"ready" | "down">()
        const onBad = deferred<void>()
        pending.push({ startup, onBad })
        return Promise.resolve({ startup: startup.promise, onBad: onBad.promise, stop: () => Promise.resolve() })
      },
      delay: () => Promise.resolve(),
      onRestart: (attempt) => {
        restarts.push(attempt)
      },
      onExhausted: () => undefined,
      log: () => undefined,
    })

    await waitFor(() => pending.length >= 1)
    pending[0].startup.resolve("down")
    await waitFor(() => restarts.length >= 1)

    await waitFor(() => pending.length >= 2)
    pending[1].startup.resolve("down")
    await waitFor(() => restarts.length >= 2)

    await waitFor(() => pending.length >= 3)
    pending[2].startup.resolve("ready")
    pending[2].onBad.resolve()
    await waitFor(() => restarts.length >= 3)

    expect(restarts).toEqual([1, 2, 1])
    await manager.stop()
  })

  test("resolves ready and halts on stop without restarting", async () => {
    let restarted = false
    let spawnCount = 0

    const { ready, stop } = createSidecarManager({
      spawn: () => {
        spawnCount += 1
        return Promise.resolve(session({ startup: "ready" }))
      },
      delay: () => Promise.resolve(),
      onRestart: () => {
        restarted = true
      },
      onExhausted: () => undefined,
      log: () => undefined,
    })

    await ready
    await waitFor(() => spawnCount === 1)
    await stop()
    await waitFor(() => spawnCount === 1)

    expect(restarted).toBe(false)
  })
})

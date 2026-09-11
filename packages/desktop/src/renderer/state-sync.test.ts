import { describe, expect, test, vi } from "bun:test"
import type { WslServersState } from "@opencode-ai/app/wsl/types"
import { resolveStartupServerState, withOptimisticUpdate } from "./state-sync"

const wsl = (id: string, kind: "ready" | "starting" | "failed"): WslServersState => ({
  runtime: null,
  installed: [],
  online: [],
  distroProbes: {},
  opencodeChecks: {},
  pendingRestart: false,
  job: null,
  servers: [{ config: { id, distro: id.replace("wsl:", "") }, runtime: { kind } }],
})

describe("resolveStartupServerState", () => {
  test("keeps the local sidecar when it is reachable and no default is set", () => {
    const result = resolveStartupServerState({ defaultServer: undefined, sidecarReachable: true })
    expect(result).toEqual({ key: "sidecar", drift: [], ok: true })
  })

  test("keeps a ready WSL default without drift", () => {
    const result = resolveStartupServerState({ defaultServer: "wsl:Debian", wslState: wsl("wsl:Debian", "ready"), sidecarReachable: true })
    expect(result).toEqual({ key: "wsl:Debian", drift: [], ok: true })
  })

  test("falls back to the sidecar and reports drift when the WSL default is not ready", () => {
    const result = resolveStartupServerState({ defaultServer: "wsl:Debian", wslState: wsl("wsl:Debian", "starting"), sidecarReachable: true })
    expect(result).toEqual({ key: "sidecar", drift: [{ kind: "wsl-default-unavailable", defaultKey: "wsl:Debian" }], ok: true })
  })

  test("prefers a ready WSL server when the local sidecar is unreachable", () => {
    const result = resolveStartupServerState({ defaultServer: "sidecar", wslState: wsl("wsl:Debian", "ready"), sidecarReachable: false })
    expect(result).toEqual({ key: "wsl:Debian", drift: [{ kind: "sidecar-unavailable", fallbackKey: "wsl:Debian" }], ok: true })
  })

  test("reports not-ok when the sidecar is unreachable and no fallback exists", () => {
    const result = resolveStartupServerState({ defaultServer: "sidecar", sidecarReachable: false })
    expect(result.ok).toBe(false)
    expect(result.key).toBe("sidecar")
  })

  test("leaves a non-wsl default untouched when the sidecar is reachable", () => {
    const result = resolveStartupServerState({ defaultServer: "http://remote:1234", sidecarReachable: true })
    expect(result.key).toBe("http://remote:1234")
    expect(result.drift).toEqual([])
  })
})

describe("withOptimisticUpdate", () => {
  test("applies optimistically and keeps it when the commit succeeds", async () => {
    const apply = vi.fn()
    const revert = vi.fn()
    const ok = await withOptimisticUpdate({ apply, commit: async () => undefined, revert })
    expect(ok).toBe(true)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(revert).not.toHaveBeenCalled()
  })

  test("reverts the optimistic value when the commit fails", async () => {
    const apply = vi.fn()
    const revert = vi.fn()
    const ok = await withOptimisticUpdate({ apply, commit: async () => { throw new Error("nope") }, revert })
    expect(ok).toBe(false)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(revert).toHaveBeenCalledTimes(1)
  })
})

import type { WslServersState } from "@opencode-ai/app/wsl/types"
import { availableStartupServer, firstReadyWslKey } from "./wsl/connections"

export type ServerDrift =
  | { kind: "wsl-default-unavailable"; defaultKey: string }
  | { kind: "sidecar-unavailable"; fallbackKey: string }

export type ResolvedStartupServer = {
  key: string
  drift: ServerDrift[]
  ok: boolean
}

export function resolveStartupServerState(config: {
  defaultServer: string | null | undefined
  wslState?: WslServersState
  sidecarReachable: boolean
}): ResolvedStartupServer {
  const { defaultServer, wslState, sidecarReachable } = config
  const drift: ServerDrift[] = []

  const intended = defaultServer ?? "sidecar"
  const resolved = availableStartupServer(defaultServer, wslState)
  if (resolved !== intended && intended.startsWith("wsl:")) {
    drift.push({ kind: "wsl-default-unavailable", defaultKey: intended })
  }

  if (resolved === "sidecar" && !sidecarReachable) {
    const fallback = firstReadyWslKey(wslState)
    if (fallback) {
      drift.push({ kind: "sidecar-unavailable", fallbackKey: fallback })
      return { key: fallback, drift, ok: true }
    }
  }

  return { key: resolved, drift, ok: resolved !== "sidecar" || sidecarReachable }
}

export async function withOptimisticUpdate(params: {
  apply: () => void
  commit: () => Promise<void>
  revert: () => void
}): Promise<boolean> {
  params.apply()
  try {
    await params.commit()
    return true
  } catch {
    params.revert()
    return false
  }
}

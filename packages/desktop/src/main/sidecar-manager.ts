export const SIDECAR_MAX_RESTARTS = 5
export const SIDECAR_RESTART_BASE_DELAY = 1000
export const SIDECAR_RESTART_MAX_DELAY = 300_000
export const SIDECAR_HEALTH_POLL_INTERVAL = 30_000

export type SidecarSession = {
  startup: Promise<"ready" | "down">
  onBad: Promise<void>
  stop: () => Promise<void>
}

export type SidecarManagerDeps = {
  spawn: () => Promise<SidecarSession>
  delay: (ms: number) => Promise<void>
  onRestart: (attempt: number) => void
  onExhausted: () => void
  log: (message: string, data?: unknown) => void
}

export function createSidecarManager(deps: SidecarManagerDeps): { stop: () => Promise<void>; ready: Promise<void> } {
  let running = true
  let readyResolve: (() => void) | undefined
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve
  })

  const backoff = (attempt: number) =>
    Math.min(SIDECAR_RESTART_MAX_DELAY, SIDECAR_RESTART_BASE_DELAY * 2 ** (attempt - 1))

  const stop = async () => {
    running = false
  }

  void run()

  async function run() {
    let attempt = 0
    while (running) {
      let session: SidecarSession
      try {
        session = await spawnSession(0)
      } catch {
        return
      }
      if (!running) {
        await safeStop(session)
        return
      }
      const startup = await session.startup
      if (startup === "ready" && readyResolve) {
        readyResolve()
        readyResolve = undefined
      }
      if (!running) {
        await safeStop(session)
        return
      }
      if (startup === "ready") {
        attempt = 0
        await session.onBad
        if (!running) {
          await safeStop(session)
          return
        }
      }
      attempt += 1
      if (attempt > SIDECAR_MAX_RESTARTS) {
        await safeStop(session)
        deps.onExhausted()
        return
      }
      deps.onRestart(attempt)
      await deps.delay(backoff(attempt))
    }
  }

  async function spawnSession(currentAttempt: number): Promise<SidecarSession> {
    try {
      return await deps.spawn()
    } catch (error) {
      deps.log("sidecar spawn failed", { attempt: currentAttempt + 1, error })
      if (!running) throw error
      if (currentAttempt + 1 > SIDECAR_MAX_RESTARTS) {
        deps.onExhausted()
        throw error
      }
      await deps.delay(backoff(currentAttempt + 1))
      return spawnSession(currentAttempt + 1)
    }
  }

  return { stop, ready }
}

async function safeStop(session: SidecarSession) {
  await session.stop().catch(() => undefined)
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function checkHealth(url: string, password?: string | null): Promise<boolean> {
  let healthUrls: URL[]
  try {
    healthUrls = [new URL("/api/health", url), new URL("/global/health", url)]
  } catch {
    return false
  }

  const headers = new Headers()
  if (password) {
    const auth = Buffer.from(`opencode:${password}`).toString("base64")
    headers.set("authorization", `Basic ${auth}`)
  }

  for (const healthUrl of healthUrls) {
    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) return true
    } catch {}
  }
  return false
}

export async function pollHealth(url: string, password?: string | null): Promise<"healthy" | "failure"> {
  while (true) {
    await delay(SIDECAR_HEALTH_POLL_INTERVAL)
    if (!(await checkHealth(url, password))) return "failure"
  }
}

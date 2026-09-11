import { describe, expect, test } from "bun:test"
import { createServerReadyGate } from "./server-connection"

describe("createServerReadyGate", () => {
  test("suppresses the broadcast on the first ready, broadcasts on restart", () => {
    const broadcasts: number[] = []
    const gate = createServerReadyGate(() => broadcasts.push(1))

    gate({ url: "http://x:1", username: "opencode", password: "p" })
    expect(broadcasts).toHaveLength(0)

    gate({ url: "http://x:1", username: "opencode", password: "p" })
    gate({ url: "http://x:1", username: "opencode", password: "p" })
    expect(broadcasts).toHaveLength(2)
  })

  test("passes the connection data through to the restart callback", () => {
    const seen: string[] = []
    const gate = createServerReadyGate<{ url: string }>((data) => seen.push(data.url))

    gate({ url: "http://first:1" })
    gate({ url: "http://second:2" })
    expect(seen).toEqual(["http://second:2"])
  })
})

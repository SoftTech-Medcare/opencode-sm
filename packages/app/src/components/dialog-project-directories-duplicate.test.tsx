import { describe, expect, test } from "bun:test"
import { createMemo, createResource, createRoot } from "solid-js"
import type { ProjectDirectory } from "@opencode-ai/sdk/v2"

function buildMemos(directories: () => ProjectDirectory[]) {
  const filtered = createMemo(() => directories() ?? [])
  const ordered = createMemo(() => {
    const list = filtered()
    const primaryItem = list.find((dir) => dir.primary)
    const rest = list.filter((dir) => !dir.primary)
    return primaryItem ? [primaryItem, ...rest] : rest
  })
  const primary = createMemo(() => ordered().find((dir) => dir.primary))
  const attached = createMemo(() => ordered().filter((dir) => !dir.primary))
  return { primary, attached }
}

describe("dialog-project-directories in-place refetch", () => {
  test("does not duplicate a directory across main and additional after changing primary", async () => {
    let data: ProjectDirectory[] = [
      { directory: "/softtech", type: "main", primary: true },
      { directory: "/nikkiso", type: "attached", primary: false },
    ]
    const [directories, { refetch }] = createResource(() => "pid", async () => {
      await Promise.resolve()
      return data
    })

    const memos = createRoot(() => buildMemos(directories))

    await Promise.resolve()
    await Promise.resolve()

    expect(memos.primary()!.directory).toBe("/softtech")
    expect(memos.attached().map((d) => d.directory)).toEqual(["/nikkiso"])

    // Simulate clicking "Make main" on /nikkiso, then refetch returning the new state.
    data = [
      { directory: "/softtech", type: "attached", primary: false },
      { directory: "/nikkiso", type: "main", primary: true },
    ]
    refetch()

    await Promise.resolve()
    await Promise.resolve()

    expect(memos.primary()!.directory).toBe("/nikkiso")
    expect(memos.attached().map((d) => d.directory)).toEqual(["/softtech"])
    expect(memos.attached().map((d) => d.directory)).not.toContain("/nikkiso")
  })
})

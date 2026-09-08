import { describe, expect, test } from "bun:test"
import { createMemo, createResource } from "solid-js"
import type { ProjectDirectory } from "@opencode-ai/sdk/v2"

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function buildMemos(getList: () => ProjectDirectory[]) {
  const filtered = createMemo(() => getList() ?? [])
  const ordered = createMemo(() => {
    const list = filtered()
    const primaryItem = list.find((dir) => dir.primary)
    const rest = list.filter((dir) => !dir.primary)
    return primaryItem ? [primaryItem, ...rest] : rest
  })
  const primary = createMemo(() => ordered().find((dir) => dir.primary))
  const attached = createMemo(() => ordered().filter((dir) => !dir.primary))
  return { ordered, primary, attached }
}

describe("dialog-project-directories reactivity", () => {
  test("ordered/primary/attached reflect a changed primary after refetch", async () => {
    let current: ProjectDirectory[] = [
      { directory: "/a", type: "main", primary: true },
      { directory: "/b", type: "attached", primary: false },
    ]
    let resolveNext: ((value: Promise<ProjectDirectory[]>) => void) | undefined

    const [directories, { refetch }] = createResource(() => "pid", async () => {
      const p = Promise.resolve(current)
      await new Promise<void>((res) => {
        resolveNext = () => res()
        // resolve immediately on next tick
        queueMicrotask(res)
      })
      return p
    })

    const { ordered, primary, attached } = buildMemos(directories)
    await flush()

    expect(primary()!.directory).toBe("/a")
    expect(attached().map((d) => d.directory)).toEqual(["/b"])

    // Simulate the server returning a new primary.
    current = [
      { directory: "/a", type: "attached", primary: false },
      { directory: "/b", type: "main", primary: true },
    ]
    refetch()
    await flush()

    expect(primary()!.directory).toBe("/b")
    expect(ordered().map((d) => d.directory)).toEqual(["/b", "/a"])
    expect(attached().map((d) => d.directory)).toEqual(["/a"])
  })
})

import { describe, expect, test } from "bun:test"
import { createEffect, createMemo, createResource, createSignal, Show } from "solid-js"
import { createComponent, render } from "solid-js/web"
import type { ProjectDirectory } from "@opencode-ai/sdk/v2"

// Mirrors MainRow in dialog-project-directories: the directory is read reactively
// (via an accessor) so it keeps up when the primary changes, even though the wrapping
// <Show> uses truthiness equality and never re-renders its children on a truthy->truthy change.
function MainRow(props: { directory: () => ProjectDirectory }) {
  const el = document.createElement("div")
  el.setAttribute("data-testid", "main")
  createEffect(() => {
    el.textContent = props.directory().directory
  })
  return el
}

function buildMemos(directories: () => ProjectDirectory[]) {
  const ordered = createMemo(() => {
    const list = directories() ?? []
    const primaryItem = list.find((dir) => dir.primary)
    const rest = list.filter((dir) => !dir.primary)
    return primaryItem ? [primaryItem, ...rest] : rest
  })
  const primary = createMemo(() => ordered().find((dir) => dir.primary))
  const attached = createMemo(() => ordered().filter((dir) => !dir.primary))
  return { primary, attached }
}

function mainTexts(host: Element) {
  return Array.from(host.querySelectorAll("[data-testid='main']")).map((n) => n.textContent)
}

const makeDir = (directory: string, primary: boolean): ProjectDirectory => ({
  directory,
  type: primary ? "main" : "attached",
  primary,
})

describe("dialog-project-directories make main", () => {
  test("pipeline reflects the new primary after refetch with no duplicate", async () => {
    let data: ProjectDirectory[] = [makeDir("/softtech", true), makeDir("/nikkiso", false)]
    const [directories, { refetch }] = createResource(() => "pid", async () => {
      await Promise.resolve()
      return data
    })
    const { primary, attached } = buildMemos(directories)

    await Promise.resolve()
    await Promise.resolve()
    expect(primary()!.directory).toBe("/softtech")
    expect(attached().map((dir) => dir.directory)).toEqual(["/nikkiso"])

    // Click "Make main" on /nikkiso: the server now reports /nikkiso as primary and
    // /softtech as attached, then the dialog refetches.
    data = [makeDir("/softtech", false), makeDir("/nikkiso", true)]
    refetch()

    await Promise.resolve()
    await Promise.resolve()

    expect(primary()!.directory).toBe("/nikkiso")
    expect(attached().map((dir) => dir.directory)).toEqual(["/softtech"])
    expect(attached().map((dir) => dir.directory)).not.toContain("/nikkiso")
  })

  test("main row rendering reflects the new primary (reactive, not stale)", () => {
    const [primary, setPrimary] = createSignal<ProjectDirectory>(makeDir("/softtech", true))

    const host = document.createElement("div")
    render(
      () =>
        createComponent(Show, {
          when: primary,
          children: (_value: unknown) => createComponent(MainRow, { directory: () => primary()! }),
        }),
      host,
    )

    expect(mainTexts(host)).toEqual(["/softtech"])

    // "Make main" promotes /nikkiso; the mounted MainRow must follow.
    setPrimary(makeDir("/nikkiso", true))

    expect(mainTexts(host)).toEqual(["/nikkiso"])
  })
})

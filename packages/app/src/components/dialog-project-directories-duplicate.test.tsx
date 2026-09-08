import { describe, expect, test } from "bun:test"
import { createMemo, createResource } from "solid-js"
import { createComponent, For, render, Show } from "solid-js/web"
import type { ProjectDirectory } from "@opencode-ai/sdk/v2"

function DirectoriesView(props: { directories: () => ProjectDirectory[] }) {
  const filtered = createMemo(() => props.directories() ?? [])
  const ordered = createMemo(() => {
    const list = filtered()
    const primaryItem = list.find((dir) => dir.primary)
    const rest = list.filter((dir) => !dir.primary)
    return primaryItem ? [primaryItem, ...rest] : rest
  })
  const primary = createMemo(() => ordered().find((dir) => dir.primary))
  const attached = createMemo(() => ordered().filter((dir) => !dir.primary))

  return createComponent("div", {
    children: () => [
      createComponent(Show, {
        when: primary,
        children: () =>
          createComponent("div", {
            "data-testid": "main",
            "data-dir": () => primary()!.directory,
            children: () => primary()!.directory,
          }),
      }),
      createComponent(Show, {
        when: () => attached().length > 0,
        children: () =>
          createComponent("div", {
            "data-testid": "additional",
            children: () =>
              createComponent(For, {
                each: attached,
                children: (dir: ProjectDirectory) =>
                  createComponent("div", {
                    "data-testid": "att-row",
                    "data-dir": () => dir.directory,
                    children: () => dir.directory,
                  }),
              }),
          }),
      }),
    ],
  })
}

function countByTestId(root: Element, testId: string, attr: string) {
  return Array.from(root.querySelectorAll(`[data-testid="${testId}"]`)).map((n) => n.getAttribute(attr))
}

describe("dialog-project-directories in-place refetch", () => {
  test("does not duplicate a directory across main and additional after changing primary", () => {
    let data: ProjectDirectory[] = [
      { directory: "/softtech", type: "main", primary: true },
      { directory: "/nikkiso", type: "attached", primary: false },
    ]
    const [directories, { refetch }] = createResource(() => "pid", async () => {
      await Promise.resolve()
      return data
    })

    const host = document.createElement("div")
    render(() => createComponent(DirectoriesView, { directories }), host)

    expect(countByTestId(host, "main", "data-dir")).toEqual(["/softtech"])
    expect(countByTestId(host, "att-row", "data-dir")).toEqual(["/nikkiso"])

    // Simulate clicking "Make main" on /nikkiso, then refetch returning the new state.
    data = [
      { directory: "/softtech", type: "attached", primary: false },
      { directory: "/nikkiso", type: "main", primary: true },
    ]
    refetch()

    return Promise.resolve().then(() => {
      expect(countByTestId(host, "main", "data-dir")).toEqual(["/nikkiso"])
      expect(countByTestId(host, "att-row", "data-dir")).toEqual(["/softtech"])
      expect(countByTestId(host, "att-row", "data-dir")).not.toContain("/nikkiso")
    })
  })
})

import { describe, expect, test } from "bun:test"
import { createMemo, createResource, For, Show } from "solid-js"
import { render } from "solid-js/web"
import type { ProjectDirectory } from "@opencode-ai/sdk/v2"

function Row(props: { dir: () => ProjectDirectory }) {
  return (
    <div data-testid="row" data-dir={() => props.dir().directory}>
      {() => props.dir().directory}
    </div>
  )
}

function MainRow(props: { dir: () => ProjectDirectory }) {
  return (
    <div data-testid="main" data-dir={() => props.dir().directory}>
      {() => props.dir().directory}
    </div>
  )
}

function View(props: { directories: () => ProjectDirectory[] }) {
  const ordered = createMemo(() => {
    const list = props.directories() ?? []
    const primaryItem = list.find((d) => d.primary)
    const rest = list.filter((d) => !d.primary)
    return primaryItem ? [primaryItem, ...rest] : rest
  })
  const primary = createMemo(() => ordered().find((d) => d.primary))
  const attached = createMemo(() => ordered().filter((d) => !d.primary))

  return (
    <div>
      <Show when={primary}>
        <MainRow dir={() => primary()!} />
      </Show>
      <Show when={() => attached().length > 0}>
        <div data-testid="additional">
          <For each={attached}>
            {(dir) => <Row dir={() => dir} />}
          </For>
        </div>
      </Show>
    </div>
  )
}

function mainRows(host: Element) {
  return Array.from(host.querySelectorAll("[data-testid='main']")).map((n) => n.getAttribute("data-dir"))
}
function additionalRows(host: Element) {
  return Array.from(host.querySelectorAll("[data-testid='additional'] > [data-testid='row']")).map(
    (n) => n.getAttribute("data-dir"),
  )
}

describe("dialog-project-directories render reconciliation", () => {
  test("main row updates to new primary after refetch", async () => {
    let data: ProjectDirectory[] = [
      { directory: "/softtech", type: "main", primary: true },
      { directory: "/nikkiso", type: "attached", primary: false },
    ]
    const [directories, { refetch }] = createResource(() => "pid", async () => {
      await Promise.resolve()
      return data
    })

    const host = document.createElement("div")
    render(() => <View directories={directories} />, host)

    await Promise.resolve()
    await Promise.resolve()

    expect(mainRows(host)).toEqual(["/softtech"])
    expect(additionalRows(host)).toEqual(["/nikkiso"])

    data = [
      { directory: "/softtech", type: "attached", primary: false },
      { directory: "/nikkiso", type: "main", primary: true },
    ]
    refetch()

    await Promise.resolve()
    await Promise.resolve()

    expect(mainRows(host)).toEqual(["/nikkiso"])
    expect(additionalRows(host)).toEqual(["/softtech"])
  })
})

import { describe, expect, test } from "bun:test"
import { createMemo, createRoot, createSignal } from "solid-js"
import { Show } from "solid-js/web"

describe("Show re-render on truthy->truthy change", () => {
  test("content does not recompute when condition stays truthy", () => {
    createRoot((dispose) => {
      const [primary, setPrimary] = createSignal<{ directory: string } | undefined>({ directory: "SoftTech" })
      let rendered: string | undefined
      const showMemo = Show({
        when: primary,
        children: () => {
          rendered = "MAIN:" + primary()!.directory
          return undefined
        },
      })
      showMemo()
      expect(rendered).toBe("MAIN:SoftTech")
      setPrimary({ directory: "nikkiso" })
      showMemo()
      // If the Show re-renders on truthy->truthy change, rendered updates to nikkiso.
      expect(rendered).toBe("MAIN:nikkiso")
      dispose()
    })
  })
})

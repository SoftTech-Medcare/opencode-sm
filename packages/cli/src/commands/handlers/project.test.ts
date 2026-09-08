import { describe, expect, test } from "bun:test"
import { formatDirectoryTable, resolveProjectID, type Client, type Directory } from "./project"

const main: Directory = { directory: "/home/user/project", type: "main", primary: true }
const attached: Directory = { directory: "/home/project-copy", type: "attached", primary: false }

describe("formatDirectoryTable", () => {
  test("renders a header and one row per directory", () => {
    const output = formatDirectoryTable([main, attached])
    const lines = output.split("\n")
    expect(lines[0]).toContain("Directory")
    expect(lines[0]).toContain("Type")
    expect(lines[0]).toContain("Primary")
    expect(output).toContain("/home/user/project")
    expect(output).toContain("/home/project-copy")
    expect(output).toContain("attached")
  })

  test("marks the primary directory", () => {
    const line = formatDirectoryTable([main])
      .split("\n")
      .find((row) => row.includes("/home/user/project"))!
    expect(line).toContain("true")
  })

  test("left-pads columns so rows align", () => {
    const lines = formatDirectoryTable([main]).split("\n")
    const header = lines[0]
    const row = lines[1]
    expect(header.indexOf("Type")).toBe(row.indexOf("main"))
  })

  test("prints an empty cell for non-primary directories", () => {
    const line = formatDirectoryTable([attached])
      .split("\n")
      .find((row) => row.includes("/home/project-copy"))!
    expect(line).not.toContain("true")
  })
})

describe("resolveProjectID", () => {
  test("prefers an explicit project id", async () => {
    const client = {
      project: { current: async () => ({ data: { id: "proj/ignored" } }) },
    } as unknown as Client
    await expect(resolveProjectID(client, "proj/explicit")).resolves.toBe("proj/explicit")
  })

  test("falls back to the current project", async () => {
    const client = {
      project: { current: async () => ({ data: { id: "proj/current" } }) },
    } as unknown as Client
    await expect(resolveProjectID(client)).resolves.toBe("proj/current")
  })

  test("throws when no project is active", async () => {
    const client = {
      project: { current: async () => ({ data: undefined }) },
    } as unknown as Client
    await expect(resolveProjectID(client)).rejects.toThrow("No active project found")
  })
})

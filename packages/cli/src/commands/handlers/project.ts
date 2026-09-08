import { EOL } from "node:os"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { ProjectDirectories } from "@opencode-ai/sdk/v2"

export type Client = ReturnType<typeof createOpencodeClient>
export type Directory = ProjectDirectories[number]

export function resolveProjectID(client: Client, project?: string): Promise<string> {
  if (project) return Promise.resolve(project)
  return client.project.current().then((response) => {
    const id = response.data?.id
    if (!id) throw new Error("No active project found. Run inside a project directory or pass --project.")
    return id
  })
}

export function formatDirectoryTable(directories: readonly Directory[]): string {
  const columns = ["Directory", "Type", "Primary"] as const
  const rows = [columns, ...directories.map((directory) => [directory.directory, directory.type, primaryText(directory)])]
  const widths = columns.map((_, index) => Math.max(...rows.map((row) => row[index].length)))
  return rows
    .map((row) => columns.map((_, index) => row[index].padEnd(widths[index])).join("  ").trimEnd())
    .join(EOL)
}

function primaryText(directory: Directory) {
  return directory.primary ? "true" : ""
}

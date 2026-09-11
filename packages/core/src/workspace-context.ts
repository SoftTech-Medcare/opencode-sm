export * as WorkspaceContext from "./workspace-context"

import { Array, Effect, Layer, Schema } from "effect"
import { Location } from "./location"
import { WorkspaceDirectories } from "./control-plane/directories"
import { AbsolutePath } from "./schema"
import { SystemContext } from "./system-context/index"
import { SystemContextRegistry } from "./system-context/registry"
import { makeLocationNode } from "./effect/app-node"

class Directory extends Schema.Class<Directory>("WorkspaceContext.Directory")({
  path: AbsolutePath,
  name: Schema.String,
  role: Schema.optional(Schema.String),
  primary: Schema.Boolean,
}) {}

const Directories = Schema.Array(Directory)
const key = SystemContext.Key.make("core/workspace")

const render = (directories: ReadonlyArray<Directory>) => {
  const primary = directories.find((item) => item.primary)
  const lines = [
    "This project spans multiple directories:",
    ...directories.map((item) => `  - ${item.name} (${item.path})${item.primary ? " - primary" : ""}${item.role ? ` [${item.role}]` : ""}`),
  ]
  if (primary) lines.push(`The primary working directory is ${primary.name}.`)
  return lines.join("\n")
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    const workspaceDirectories = yield* WorkspaceDirectories.Service

    const source = (value: ReadonlyArray<Directory>) =>
      SystemContext.make({
        key,
        codec: Schema.toCodecJson(Directories),
        load: Effect.succeed(value),
        baseline: (directories) =>
          ["This project is organized across multiple directories. Use the multi-directory tools (grep, read, edit, write) with explicit paths to work across them.", render(directories)].join("\n\n"),
        update: (_previous, directories) => `The project directory structure has changed:\n\n${render(directories)}`,
        removed: () => "The multi-directory workspace structure is no longer available.",
      })

    const observe = Effect.fn("WorkspaceContext.observe")(function* () {
      const directories = location.directories ?? [location.directory]
      const primary = location.directory

      const roles = new Map<string, string>()
      if (location.workspaceID) {
        const rows = yield* workspaceDirectories.list(location.workspaceID).pipe(Effect.catch(() => Effect.succeed([])))
        for (const row of rows) if (row.role) roles.set(row.directory, row.role)
      }

      return Array.map(directories, (path) =>
        new Directory({
          path,
          name: path.split("/").filter(Boolean).pop() ?? path,
          role: roles.get(path) ?? undefined,
          primary: path === primary,
        }),
      )
    })

    yield* registry.register({
      key,
      load: observe().pipe(
        Effect.map((directories) =>
          directories.length > 1 ? source(directories) : SystemContext.empty,
        ),
      ),
    })
  }),
)

export const node = makeLocationNode({
  name: "workspace-context",
  layer,
  deps: [Location.node, SystemContextRegistry.node, WorkspaceDirectories.node],
})

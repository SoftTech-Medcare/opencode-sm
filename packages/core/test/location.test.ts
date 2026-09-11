import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Location } from "@opencode-ai/core/location"
import { Project } from "@opencode-ai/core/project"
import { ProjectDirectories } from "@opencode-ai/core/project/directories"
import { WorkspaceDirectories } from "@opencode-ai/core/control-plane/directories"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { WorkspaceV2 } from "@opencode-ai/core/workspace"
import { testEffect } from "./lib/effect"

const workspaceID = WorkspaceV2.ID.make("wrk_test")
const ref = { directory: AbsolutePath.make("/repo/packages/app"), workspaceID }
const projectLayer = Layer.succeed(
  Project.Service,
  Project.Service.of({
    directories: () => Effect.succeed([]),
    resolve: () =>
      Effect.succeed({
        id: Project.ID.make("project"),
        directory: AbsolutePath.make("/repo"),
        vcs: { type: "git", store: AbsolutePath.make("/repo/.git") },
      }),
    attach: () => Effect.succeed(true),
    detach: () => Effect.succeed(true),
    setPrimary: () => Effect.void,
    commit: () => Effect.void,
  }),
)
const it = testEffect(AppNodeBuilder.build(Location.boundNode(ref), [[Project.node, projectLayer]]))

const workspaceDirectoryLayer = Layer.succeed(
  WorkspaceDirectories.Service,
  WorkspaceDirectories.Service.of({
    list: () =>
      Effect.succeed([
        { directory: AbsolutePath.make("/repo/packages/api"), role: "backend", primary: false },
        { directory: AbsolutePath.make("/repo/infra"), role: "infrastructure", primary: false },
      ]),
    find: () => Effect.succeed(undefined),
    get: () => Effect.succeed(undefined),
    contains: () => Effect.succeed(false),
    attach: () => Effect.succeed(true),
    detach: () => Effect.succeed(true),
    setPrimary: () => Effect.void,
  }),
)
const projectDirectoryLayer = Layer.succeed(
  ProjectDirectories.Service,
  ProjectDirectories.Service.of({
    list: () =>
      Effect.succeed([
        { directory: AbsolutePath.make("/repo/packages/app"), type: "attached", primary: false, strategy: undefined },
      ]),
    find: () => Effect.succeed(undefined),
    get: () => Effect.succeed(undefined),
    contains: () => Effect.succeed(false),
    attach: () => Effect.succeed(true),
    detach: () => Effect.succeed(true),
  }),
)
const multiIt = testEffect(
  AppNodeBuilder.build(Location.boundNode(ref), [
    [Project.node, projectLayer],
    [ProjectDirectories.node, projectDirectoryLayer],
    [WorkspaceDirectories.node, workspaceDirectoryLayer],
  ]),
)

describe("Location", () => {
  it.effect("resolves the current project and vcs information", () =>
    Effect.gen(function* () {
      const location = yield* Location.Service

      expect(location.directory).toBe(AbsolutePath.make("/repo/packages/app"))
      expect(location.workspaceID).toBe(workspaceID)
      expect(location.project.id).toBe(Project.ID.make("project"))
      expect(location.project.directory).toBe(AbsolutePath.make("/repo"))
      expect(location.vcs).toEqual({
        type: "git",
        store: AbsolutePath.make("/repo/.git"),
      })
    }),
  )

  multiIt.effect("merges primary, project, and workspace directories", () =>
    Effect.gen(function* () {
      const location = yield* Location.Service

      const directories = [...location.directories ?? []].sort((a, b) => (a > b ? 1 : -1))
      expect(directories).toEqual([
        AbsolutePath.make("/repo/infra"),
        AbsolutePath.make("/repo/packages/api"),
        AbsolutePath.make("/repo/packages/app"),
      ])
    }),
  )
})

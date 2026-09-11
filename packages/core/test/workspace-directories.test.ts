import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ID as WorkspaceID } from "@opencode-ai/core/workspace"
import { WorkspaceTable } from "@opencode-ai/core/control-plane/workspace.sql"
import { WorkspaceDirectories } from "@opencode-ai/core/control-plane/directories"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, WorkspaceDirectories.node])))

const projectID = Project.ID.make("workspace-directories-test")
const workspaceID = WorkspaceID.make("wrk-test-workspace-directories")
const roleWorkspaceID = WorkspaceID.make("wrk-role-test")
const directory1 = AbsolutePath.make("/tmp/workspace-dir-1")
const directory2 = AbsolutePath.make("/tmp/workspace-dir-2")
const directory3 = AbsolutePath.make("/tmp/workspace-dir-3")

function setupWorkspaces() {
  return Effect.gen(function* () {
    const db = (yield* Database.Service).db

    // Create project
    yield* db
      .insert(ProjectTable)
      .values({ id: projectID, worktree: directory1, sandboxes: [], time_created: 1, time_updated: 1 })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)

    // Create workspaces
    yield* db
      .insert(WorkspaceTable)
      .values({ id: workspaceID, type: "worktree", name: "", project_id: projectID, time_used: 1 })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)

    yield* db
      .insert(WorkspaceTable)
      .values({ id: roleWorkspaceID, type: "worktree", name: "", project_id: projectID, time_used: 1 })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
  })
}

describe("WorkspaceDirectories", () => {
  it.effect("decodes directory schemas", () =>
    Effect.sync(() => {
      expect(Schema.decodeUnknownSync(WorkspaceDirectories.ListInput)({ workspaceID })).toEqual({ workspaceID })
      expect(
        Schema.decodeUnknownSync(WorkspaceDirectories.ListOutput)([
          { directory: directory1, role: "main", primary: true },
        ]),
      ).toEqual([{ directory: directory1, role: "main", primary: true }])
    }),
  )

  it.effect("attaches a directory and lists it", () =>
    Effect.gen(function* () {
      yield* setupWorkspaces()
      const service = yield* WorkspaceDirectories.Service

      expect(yield* service.attach({ workspaceID, directory: directory1 })).toBe(true)
      const dirs = yield* service.list(workspaceID)
      expect(dirs).toHaveLength(1)
      expect(dirs[0].directory).toBe(directory1)
      expect(dirs[0].primary).toBe(true)
    }),
  )

  it.effect("attaches multiple directories", () =>
    Effect.gen(function* () {
      yield* setupWorkspaces()
      const service = yield* WorkspaceDirectories.Service

      yield* service.attach({ workspaceID, directory: directory2 })
      yield* service.attach({ workspaceID, directory: directory3 })
      const dirs = yield* service.list(workspaceID)
      expect(dirs).toHaveLength(2)
    }),
  )

  it.effect("sets primary directory", () =>
    Effect.gen(function* () {
      yield* setupWorkspaces()
      const service = yield* WorkspaceDirectories.Service

      yield* service.attach({ workspaceID, directory: directory2 })
      yield* service.attach({ workspaceID, directory: directory3 })
      yield* service.setPrimary({ workspaceID, directory: directory3 })
      const dirs = yield* service.list(workspaceID)
      expect(dirs.find((d) => d.directory === directory3)?.primary).toBe(true)
      expect(dirs.find((d) => d.directory === directory2)?.primary).toBe(false)
    }),
  )

  it.effect("finds a registered directory by path", () =>
    Effect.gen(function* () {
      yield* setupWorkspaces()
      const service = yield* WorkspaceDirectories.Service

      yield* service.attach({ workspaceID, directory: directory3 })
      const found = yield* service.find(directory3)
      expect(found).toBeDefined()
      expect(found?.workspaceID).toBe(workspaceID)
      expect(found?.directory).toBe(directory3)
    }),
  )

  it.effect("detects that a directory is contained", () =>
    Effect.gen(function* () {
      yield* setupWorkspaces()
      const service = yield* WorkspaceDirectories.Service

      yield* service.attach({ workspaceID, directory: directory3 })
      expect(yield* service.contains({ workspaceID, directory: directory3 })).toBe(true)
      expect(yield* service.contains({ workspaceID, directory: AbsolutePath.make("/tmp/unknown") })).toBe(false)
    }),
  )

  it.effect("detaches a registered directory", () =>
    Effect.gen(function* () {
      yield* setupWorkspaces()
      const service = yield* WorkspaceDirectories.Service

      yield* service.attach({ workspaceID, directory: directory2 })
      yield* service.attach({ workspaceID, directory: directory3 })
      expect(yield* service.detach({ workspaceID, directory: directory3 })).toBe(true)
      expect(yield* service.detach({ workspaceID, directory: directory3 })).toBe(false)
      const dirs = yield* service.list(workspaceID)
      expect(dirs).toHaveLength(1)
      expect(dirs[0].directory).toBe(directory2)
    }),
  )

  it.effect("auto-detects directory roles", () =>
    Effect.gen(function* () {
      yield* setupWorkspaces()
      const service = yield* WorkspaceDirectories.Service

      const frontendDir = AbsolutePath.make("/tmp/my-project/web")
      const backendDir = AbsolutePath.make("/tmp/my-project/api")
      const infraDir = AbsolutePath.make("/tmp/my-project/terraform")

      yield* service.attach({ workspaceID: roleWorkspaceID, directory: frontendDir })
      yield* service.attach({ workspaceID: roleWorkspaceID, directory: backendDir })
      yield* service.attach({ workspaceID: roleWorkspaceID, directory: infraDir })

      const frontend = yield* service.get({ workspaceID: roleWorkspaceID, directory: frontendDir })
      const backend = yield* service.get({ workspaceID: roleWorkspaceID, directory: backendDir })
      const infra = yield* service.get({ workspaceID: roleWorkspaceID, directory: infraDir })

      expect(frontend?.role).toBe("frontend")
      expect(backend?.role).toBe("backend")
      expect(infra?.role).toBe("infrastructure")
    }),
  )
})
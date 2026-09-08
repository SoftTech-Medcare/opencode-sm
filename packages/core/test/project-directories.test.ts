import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Project } from "@opencode-ai/core/project"
import { ProjectDirectories } from "@opencode-ai/core/project/directories"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, ProjectDirectories.node])))

const projectID = Project.ID.make("project-directories")
const directory = AbsolutePath.make("/tmp/project-directories")
const unknownDirectory = AbsolutePath.make("/tmp/unknown-directory")

function setup() {
  return Database.Service.use(({ db }) =>
    db
      .insert(ProjectTable)
      .values({ id: projectID, worktree: directory, sandboxes: [], time_created: 1, time_updated: 1 })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie),
  )
}

describe("ProjectDirectories", () => {
  it.effect("decodes directory schemas", () =>
    Effect.sync(() => {
      expect(Schema.decodeUnknownSync(ProjectDirectories.ListInput)({ projectID })).toEqual({ projectID })
      expect(
        Schema.decodeUnknownSync(ProjectDirectories.ListOutput)([
          { directory, type: "main", primary: true },
        ]),
      ).toEqual([{ directory, type: "main", primary: true }])
    }),
  )

  it.effect("attaches a directory and lists it with its role", () =>
    Effect.gen(function* () {
      yield* setup()
      const service = yield* ProjectDirectories.Service

      expect(yield* service.attach({ projectID, directory })).toBe(true)
      expect(yield* service.attach({ projectID, directory })).toBe(true)
      expect(yield* service.list(projectID)).toEqual([{ directory, type: "attached", primary: false, strategy: undefined }])
    }),
  )

  it.effect("stores and replaces the strategy, type, and primary", () =>
    Effect.gen(function* () {
      yield* setup()
      const service = yield* ProjectDirectories.Service
      yield* service.attach({ projectID, directory, strategy: "old/strategy" })
      expect(yield* service.get({ projectID, directory })).toEqual({
        directory,
        type: "attached",
        primary: false,
        strategy: "old/strategy",
      })

      yield* service.attach({ projectID, directory, strategy: "new/strategy", type: "main", primary: true })
      expect(yield* service.get({ projectID, directory })).toEqual({
        directory,
        type: "main",
        primary: true,
        strategy: "new/strategy",
      })
    }),
  )

  it.effect("finds a registered directory by path", () =>
    Effect.gen(function* () {
      yield* setup()
      const service = yield* ProjectDirectories.Service
      yield* service.attach({ projectID, directory })

      expect(yield* service.find(directory)).toEqual({
        projectID,
        directory,
        type: "attached",
        primary: false,
        strategy: undefined,
      })
      expect(yield* service.find(unknownDirectory)).toBeUndefined()
    }),
  )

  it.effect("detaches a registered directory", () =>
    Effect.gen(function* () {
      yield* setup()
      const service = yield* ProjectDirectories.Service
      yield* service.attach({ projectID, directory })
      expect(yield* service.detach({ projectID, directory })).toBe(true)
      expect(yield* service.detach({ projectID, directory })).toBe(false)
      expect(yield* service.list(projectID)).toEqual([])
    }),
  )
})

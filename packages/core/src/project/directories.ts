export * as ProjectDirectories from "./directories"

import { and, asc, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { AbsolutePath, optional } from "../schema"
import { ProjectSchema } from "./schema"
import { ProjectDirectoryTable } from "./sql"
import { FSUtil } from "../fs-util"
import { detectDirectoryRole } from "../util/directory-role"
import type { EffectDrizzleSqlite } from "@opencode-ai/effect-drizzle-sqlite"

export type DirectoryType = "main" | "attached"

export interface Directory {
  readonly directory: AbsolutePath
  readonly type: DirectoryType
  readonly primary: boolean
  readonly strategy?: string
  readonly role?: string
}

export interface DirectoryWithProject extends Directory {
  readonly projectID: ProjectSchema.ID
}

export const AttachInput = Schema.Struct({
  projectID: ProjectSchema.ID,
  directory: AbsolutePath,
  type: Schema.Literals(["main", "attached"]).pipe(Schema.optional),
  primary: Schema.Boolean.pipe(Schema.optional),
  strategy: Schema.optional(Schema.String),
})
export type AttachInput = typeof AttachInput.Type

export const RemoveInput = Schema.Struct({
  projectID: ProjectSchema.ID,
  directory: AbsolutePath,
})
export type RemoveInput = typeof RemoveInput.Type

export const ListInput = Schema.Struct({
  projectID: ProjectSchema.ID,
}).annotate({ identifier: "Project.DirectoriesInput" })
export type ListInput = typeof ListInput.Type

export const ListOutput = Schema.Array(
  Schema.Struct({
    directory: AbsolutePath,
    type: Schema.Literals(["main", "attached"]),
    primary: Schema.Boolean,
    strategy: optional(Schema.String),
    role: optional(Schema.String),
  }),
).annotate({ identifier: "Project.Directories" })
export type ListOutput = typeof ListOutput.Type

export interface Interface {
  readonly list: (projectID: ProjectSchema.ID) => Effect.Effect<ReadonlyArray<Directory>>
  readonly find: (directory: AbsolutePath) => Effect.Effect<DirectoryWithProject | undefined>
  readonly get: (input: {
    projectID: ProjectSchema.ID
    directory: AbsolutePath
  }) => Effect.Effect<Directory | undefined>
  readonly contains: (input: { projectID: ProjectSchema.ID; directory: AbsolutePath }) => Effect.Effect<boolean>
  /**
   * Ensure a directory is registered for a project with the given role,
   * replacing any existing row. Returns `true` once the row is registered.
   */
  readonly attach: (input: AttachInput, tx?: Transaction) => Effect.Effect<boolean>
  readonly detach: (input: RemoveInput, tx?: Transaction) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProjectDirectories") {}

type DatabaseClient = EffectDrizzleSqlite.EffectSQLiteDatabase
export type Transaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0]

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const attach = Effect.fn("ProjectDirectories.attach")(function* (input: AttachInput, tx?: Transaction) {
      yield* (tx ?? db)
        .insert(ProjectDirectoryTable)
        .values({
          project_id: input.projectID,
          directory: input.directory,
          type: input.type ?? "attached",
          primary: input.primary ?? false,
          strategy: input.strategy ?? null,
        })
        .onConflictDoUpdate({
          target: [ProjectDirectoryTable.project_id, ProjectDirectoryTable.directory],
          set: {
            type: input.type ?? ProjectDirectoryTable.type,
            primary: input.primary ?? ProjectDirectoryTable.primary,
            strategy: input.strategy ?? null,
          },
        })
        .run()
        .pipe(Effect.orDie)
      return true
    })

    const detach = Effect.fn("ProjectDirectories.detach")(function* (input: RemoveInput, tx?: Transaction) {
      return (
        (yield* (tx ?? db)
          .delete(ProjectDirectoryTable)
          .where(
            and(
              eq(ProjectDirectoryTable.project_id, input.projectID),
              eq(ProjectDirectoryTable.directory, input.directory),
            ),
          )
          .returning({ directory: ProjectDirectoryTable.directory })
          .get()
          .pipe(Effect.orDie)) !== undefined
      )
    })

    const find = Effect.fn("ProjectDirectories.find")(function* (directory: AbsolutePath) {
      const row = yield* db
        .select({
          projectID: ProjectDirectoryTable.project_id,
          directory: ProjectDirectoryTable.directory,
          type: ProjectDirectoryTable.type,
          primary: ProjectDirectoryTable.primary,
          strategy: ProjectDirectoryTable.strategy,
        })
        .from(ProjectDirectoryTable)
        .where(eq(ProjectDirectoryTable.directory, directory))
        .get()
        .pipe(Effect.orDie)
      if (row === undefined) return undefined
      return {
        projectID: row.projectID,
        directory: row.directory,
        type: row.type ?? "attached",
        primary: row.primary,
        strategy: row.strategy ?? undefined,
      }
    })

    const list = Effect.fn("ProjectDirectories.list")(function* (projectID: ProjectSchema.ID) {
      const rows = yield* db
        .select({
          directory: ProjectDirectoryTable.directory,
          type: ProjectDirectoryTable.type,
          primary: ProjectDirectoryTable.primary,
          strategy: ProjectDirectoryTable.strategy,
        })
        .from(ProjectDirectoryTable)
        .where(eq(ProjectDirectoryTable.project_id, projectID))
        .orderBy(desc(ProjectDirectoryTable.primary), desc(ProjectDirectoryTable.time_created), asc(ProjectDirectoryTable.directory))
        .all()
        .pipe(Effect.orDie)
      return rows.map((row) => ({
        directory: row.directory,
        type: row.type ?? "attached",
        primary: row.primary,
        strategy: row.strategy ?? undefined,
        role: detectDirectoryRole(row.directory) ?? undefined,
      }))
    })

    const get = Effect.fn("ProjectDirectories.get")(function* (input: {
      projectID: ProjectSchema.ID
      directory: AbsolutePath
    }) {
      const row = yield* db
        .select({
          directory: ProjectDirectoryTable.directory,
          type: ProjectDirectoryTable.type,
          primary: ProjectDirectoryTable.primary,
          strategy: ProjectDirectoryTable.strategy,
        })
        .from(ProjectDirectoryTable)
        .where(
          and(
            eq(ProjectDirectoryTable.project_id, input.projectID),
            eq(ProjectDirectoryTable.directory, input.directory),
          ),
        )
        .get()
        .pipe(Effect.orDie)
      if (row === undefined) return undefined
      return {
        directory: row.directory,
        type: row.type ?? "attached",
        primary: row.primary,
        strategy: row.strategy ?? undefined,
      }
    })

    const contains = Effect.fn("ProjectDirectories.contains")(function* (input: {
      projectID: ProjectSchema.ID
      directory: AbsolutePath
    }) {
      return (
        (yield* db
          .select({ directory: ProjectDirectoryTable.directory })
          .from(ProjectDirectoryTable)
          .where(
            and(
              eq(ProjectDirectoryTable.project_id, input.projectID),
              eq(ProjectDirectoryTable.directory, input.directory),
            ),
          )
          .get()
          .pipe(Effect.orDie)) !== undefined
      )
    })

    return Service.of({
      list,
      find,
      get,
      contains,
      attach,
      detach,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [Database.node] })

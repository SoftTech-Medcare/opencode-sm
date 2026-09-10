export * as WorkspaceDirectories from "./directories"

import { and, asc, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { AbsolutePath, optional } from "../schema"
import { WorkspaceV2 } from "../workspace"
import { FSUtil } from "../fs-util"
import { WorkspaceDirectoryTable } from "./workspace-directories.sql"

export interface Directory {
  readonly directory: AbsolutePath
  readonly role?: string
  readonly primary: boolean
}

export interface DirectoryWithWorkspace extends Directory {
  readonly workspaceID: WorkspaceV2.ID
}

export const AttachInput = Schema.Struct({
  workspaceID: WorkspaceV2.ID,
  directory: AbsolutePath,
  primary: Schema.Boolean.pipe(Schema.optional),
})
export type AttachInput = typeof AttachInput.Type

export const RemoveInput = Schema.Struct({
  workspaceID: WorkspaceV2.ID,
  directory: AbsolutePath,
})
export type RemoveInput = typeof RemoveInput.Type

export const ListInput = Schema.Struct({
  workspaceID: WorkspaceV2.ID,
}).annotate({ identifier: "Workspace.DirectoriesInput" })
export type ListInput = typeof ListInput.Type

export const ListOutput = Schema.Array(
  Schema.Struct({
    directory: AbsolutePath,
    role: optional(Schema.String),
    primary: Schema.Boolean,
  }),
).annotate({ identifier: "Workspace.Directories" })
export type ListOutput = typeof ListOutput.Type

export interface Interface {
  readonly list: (workspaceID: WorkspaceV2.ID) => Effect.Effect<ReadonlyArray<Directory>>
  readonly find: (directory: AbsolutePath) => Effect.Effect<DirectoryWithWorkspace | undefined>
  readonly get: (input: {
    workspaceID: WorkspaceV2.ID
    directory: AbsolutePath
  }) => Effect.Effect<Directory | undefined>
  readonly contains: (input: { workspaceID: WorkspaceV2.ID; directory: AbsolutePath }) => Effect.Effect<boolean>
  readonly attach: (input: AttachInput) => Effect.Effect<boolean>
  readonly detach: (input: RemoveInput) => Effect.Effect<boolean>
  readonly setPrimary: (input: { workspaceID: WorkspaceV2.ID; directory: AbsolutePath }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/WorkspaceDirectories") {}

// Directory role detection
function detectDirectoryRole(directory: string): string | null {
  // Check for infrastructure files
  if (directory.includes("/terraform") || directory.includes("\\terraform")) return "infrastructure"

  // Check for deployment files
  if (directory.includes("/deploy") || directory.includes("\\deploy")) return "deployment"

  // Check for tests directory
  if (directory.includes("/tests") || directory.includes("\\tests")) return "tests"

  // Check for backend indicators
  if (directory.includes("/api") || directory.includes("\\api")) return "backend"
  if (directory.includes("/server") || directory.includes("\\server")) return "backend"

  // Check for frontend indicators
  if (directory.includes("/web") || directory.includes("\\web")) return "frontend"
  if (directory.includes("/app") || directory.includes("\\app")) return "frontend"

  return null
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const attach = Effect.fn("WorkspaceDirectories.attach")(function* (input: AttachInput) {
      const role = detectDirectoryRole(input.directory)

      // If this is the first directory or marked as primary, set it as primary
      const existing = yield* db
        .select({ directory: WorkspaceDirectoryTable.directory })
        .from(WorkspaceDirectoryTable)
        .where(eq(WorkspaceDirectoryTable.workspace_id, input.workspaceID))
        .all()
        .pipe(Effect.orDie)

      const isPrimary = input.primary ?? existing.length === 0

      // Clear primary flag on other directories if this one is primary
      if (isPrimary) {
        yield* db
          .update(WorkspaceDirectoryTable)
          .set({ primary: false })
          .where(eq(WorkspaceDirectoryTable.workspace_id, input.workspaceID))
          .run()
          .pipe(Effect.orDie)
      }

      yield* db
        .insert(WorkspaceDirectoryTable)
        .values({
          workspace_id: input.workspaceID,
          directory: input.directory,
          role,
          primary: isPrimary,
        })
        .onConflictDoUpdate({
          target: [WorkspaceDirectoryTable.workspace_id, WorkspaceDirectoryTable.directory],
          set: {
            role: role ?? WorkspaceDirectoryTable.role,
            primary: isPrimary,
          },
        })
        .run()
        .pipe(Effect.orDie)
      return true
    })

    const detach = Effect.fn("WorkspaceDirectories.detach")(function* (input: RemoveInput) {
      return (
        (yield* db
          .delete(WorkspaceDirectoryTable)
          .where(
            and(
              eq(WorkspaceDirectoryTable.workspace_id, input.workspaceID),
              eq(WorkspaceDirectoryTable.directory, input.directory),
            ),
          )
          .returning({ directory: WorkspaceDirectoryTable.directory })
          .get()
          .pipe(Effect.orDie)) !== undefined
      )
    })

    const find = Effect.fn("WorkspaceDirectories.find")(function* (directory: AbsolutePath) {
      const row = yield* db
        .select({
          workspaceID: WorkspaceDirectoryTable.workspace_id,
          directory: WorkspaceDirectoryTable.directory,
          role: WorkspaceDirectoryTable.role,
          primary: WorkspaceDirectoryTable.primary,
        })
        .from(WorkspaceDirectoryTable)
        .where(eq(WorkspaceDirectoryTable.directory, directory))
        .get()
        .pipe(Effect.orDie)
      if (row === undefined) return undefined
      return {
        workspaceID: row.workspaceID,
        directory: AbsolutePath.make(row.directory),
        role: row.role ?? undefined,
        primary: row.primary,
      }
    })

    const list = Effect.fn("WorkspaceDirectories.list")(function* (workspaceID: WorkspaceV2.ID) {
      const rows = yield* db
        .select({
          directory: WorkspaceDirectoryTable.directory,
          role: WorkspaceDirectoryTable.role,
          primary: WorkspaceDirectoryTable.primary,
        })
        .from(WorkspaceDirectoryTable)
        .where(eq(WorkspaceDirectoryTable.workspace_id, workspaceID))
        .orderBy(desc(WorkspaceDirectoryTable.primary), desc(WorkspaceDirectoryTable.time_created), asc(WorkspaceDirectoryTable.directory))
        .all()
        .pipe(Effect.orDie)
      return rows.map((row) => ({
        directory: AbsolutePath.make(row.directory),
        role: row.role ?? undefined,
        primary: row.primary,
      }))
    })

    const get = Effect.fn("WorkspaceDirectories.get")(function* (input: {
      workspaceID: WorkspaceV2.ID
      directory: AbsolutePath
    }) {
      const row = yield* db
        .select({
          directory: WorkspaceDirectoryTable.directory,
          role: WorkspaceDirectoryTable.role,
          primary: WorkspaceDirectoryTable.primary,
        })
        .from(WorkspaceDirectoryTable)
        .where(
          and(
            eq(WorkspaceDirectoryTable.workspace_id, input.workspaceID),
            eq(WorkspaceDirectoryTable.directory, input.directory),
          ),
        )
        .get()
        .pipe(Effect.orDie)
      if (row === undefined) return undefined
      return {
        directory: AbsolutePath.make(row.directory),
        role: row.role ?? undefined,
        primary: row.primary,
      }
    })

    const contains = Effect.fn("WorkspaceDirectories.contains")(function* (input: {
      workspaceID: WorkspaceV2.ID
      directory: AbsolutePath
    }) {
      return (
        (yield* db
          .select({ directory: WorkspaceDirectoryTable.directory })
          .from(WorkspaceDirectoryTable)
          .where(
            and(
              eq(WorkspaceDirectoryTable.workspace_id, input.workspaceID),
              eq(WorkspaceDirectoryTable.directory, input.directory),
            ),
          )
          .get()
          .pipe(Effect.orDie)) !== undefined
      )
    })

    const setPrimary = Effect.fn("WorkspaceDirectories.setPrimary")(function* (input: {
      workspaceID: WorkspaceV2.ID
      directory: AbsolutePath
    }) {
      // Clear primary flag on all directories
      yield* db
        .update(WorkspaceDirectoryTable)
        .set({ primary: false })
        .where(eq(WorkspaceDirectoryTable.workspace_id, input.workspaceID))
        .run()
        .pipe(Effect.orDie)

      // Set primary flag on the specified directory
      yield* db
        .update(WorkspaceDirectoryTable)
        .set({ primary: true })
        .where(
          and(
            eq(WorkspaceDirectoryTable.workspace_id, input.workspaceID),
            eq(WorkspaceDirectoryTable.directory, input.directory),
          ),
        )
        .run()
        .pipe(Effect.orDie)
    })

    return Service.of({
      list,
      find,
      get,
      contains,
      attach,
      detach,
      setPrimary,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [Database.node] })
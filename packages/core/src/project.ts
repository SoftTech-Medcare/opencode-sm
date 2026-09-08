export * as ProjectV2 from "./project"
export * as Project from "./project"

import { Context, Effect, Layer, Schema } from "effect"
import path from "path"
import { and, eq } from "drizzle-orm"
import { AbsolutePath } from "./schema"
import { FSUtil } from "./fs-util"
import { Git } from "./git"
import { makeGlobalNode } from "./effect/app-node"
import { Hash } from "./util/hash"
import { ProjectDirectories } from "./project/directories"
import { ProjectSchema } from "./project/schema"
import { Database } from "./database/database"
import { ProjectTable, ProjectDirectoryTable } from "./project/sql"

export const ID = ProjectSchema.ID
export type ID = ProjectSchema.ID

export const Vcs = ProjectSchema.Vcs
export type Vcs = ProjectSchema.Vcs

export class Info extends Schema.Class<Info>("Project.Info")({
  id: ID,
}) {}

export const DirectoriesInput = ProjectDirectories.ListInput
export type DirectoriesInput = typeof DirectoriesInput.Type

export const Directories = ProjectDirectories.ListOutput
export type Directories = typeof Directories.Type

export interface Resolved {
  readonly previous?: ID
  readonly id: ID
  readonly directory: AbsolutePath
  readonly vcs?: Vcs
}

export interface Interface {
  readonly directories: (input: DirectoriesInput) => Effect.Effect<Directories>
  readonly resolve: (input: AbsolutePath) => Effect.Effect<Resolved>
  readonly attach: (input: ProjectDirectories.AttachInput) => Effect.Effect<boolean>
  readonly detach: (input: ProjectDirectories.RemoveInput) => Effect.Effect<boolean>
  readonly setPrimary: (input: { projectID: ID; directory: AbsolutePath }) => Effect.Effect<void>
  /**
   * Temporary bridge method for writing the resolved project ID to the repo-local cache.
   *
   * This exists while the old opencode project service and this core project
   * service work together: core resolves the ID, while the old service still owns
   * database migration and persistence. The old service should call this after it
   * finishes migrating from `resolve().previous` to `resolve().id`; once project
   * persistence moves into core, this separate bridge method can go away.
   */
  readonly commit: (input: { store: AbsolutePath; id: ID }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProjectV2") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const projectDirectories = yield* ProjectDirectories.Service
    const db = (yield* Database.Service).db

    const directories = Effect.fn("Project.directories")(function* (input: DirectoriesInput) {
      return yield* projectDirectories.list(input.projectID)
    })

    const attach = Effect.fn("Project.attach")(function* (input: ProjectDirectories.AttachInput) {
      return yield* projectDirectories.attach(input)
    })

    const detach = Effect.fn("Project.detach")(function* (input: ProjectDirectories.RemoveInput) {
      return yield* projectDirectories.detach(input)
    })

    const cached = Effect.fnUntraced(function* (dir: string) {
      return yield* fs.readFileString(path.join(dir, "opencode")).pipe(
        Effect.map((value) => value.trim()),
        Effect.map((value) => (value ? ID.make(value) : undefined)),
        Effect.catch(() => Effect.succeed(undefined)),
      )
    })

    const remote = Effect.fnUntraced(function* (repo: Git.Repository) {
      const origin = yield* git.remote.get(repo)
      if (!origin) return undefined
      const normalized = url(origin)
      if (!normalized) return undefined
      return ID.make(Hash.fast(`git-remote:${normalized}`))
    })

    function url(input: string) {
      const value = input.trim()
      if (!value) return undefined

      try {
        const parsed = new URL(value)
        if (parsed.protocol === "file:") return undefined
        return parts(parsed.hostname, parsed.pathname)
      } catch {
        const scp = value.match(/^([^@/:]+@)?([^/:]+):(.+)$/)
        if (scp) return parts(scp[2], scp[3])
        return undefined
      }
    }

    function parts(host: string, name: string) {
      const pathname = name
        .replace(/^\/+/, "")
        .replace(/\.git\/?$/, "")
        .replace(/\/+$/, "")
      if (!host || !pathname) return undefined
      return `${host.toLowerCase()}/${pathname}`
    }

    const root = Effect.fnUntraced(function* (repo: Git.Repository) {
      const root = (yield* git.history.rootCommits(repo))[0]
      return root ? ID.make(root) : undefined
    })

    const resolve = Effect.fn("Project.resolve")(function* (input: AbsolutePath) {
      const repo = yield* git.repo.discover(input)
      const worktree = repo ? repo.worktree : input
      const vcs = repo ? { type: "git" as const, store: repo.commonDirectory } : undefined
      const member = yield* projectDirectories.find(worktree)

      // Git-identity-based project ID: explicit remote, then repo-local cache,
      // then the shared root commit (undefined for a repo with no commits).
      let previous: ID | undefined
      let gitID: ID | undefined
      if (repo) {
        previous = yield* cached(repo.commonDirectory)
        gitID = (yield* remote(repo)) ?? previous ?? (yield* root(repo))
      }

      // A registered member reuses its project unless the git identity points
      // elsewhere: a checkout that moved to a new remote must migrate the data
      // of the project it previously belonged to.
      if (member !== undefined) {
        if (gitID !== undefined && gitID !== member.projectID) {
          return {
            previous: member.projectID,
            id: gitID,
            directory: worktree,
            vcs,
          }
        }
        return { id: member.projectID, directory: worktree, vcs }
      }

      if (repo) {
        return {
          previous,
          id: gitID ?? ID.global,
          directory: worktree,
          vcs,
        }
      }

      return { id: ID.global, directory: AbsolutePath.make(path.parse(input).root), vcs: undefined }
    })

    const setPrimary = Effect.fn("Project.setPrimary")(function* (input: { projectID: ID; directory: AbsolutePath }) {
      const directory = AbsolutePath.make(input.directory)
      const repo = yield* git.repo.discover(directory)
      const worktree = repo ? repo.worktree : directory
      const vcs = repo ? { type: "git" as const, store: repo.commonDirectory } : undefined
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          yield* tx
            .update(ProjectDirectoryTable)
            .set({ type: "attached", primary: false })
            .where(and(eq(ProjectDirectoryTable.project_id, input.projectID), eq(ProjectDirectoryTable.primary, true)))
            .run()
          yield* tx
            .insert(ProjectDirectoryTable)
            .values({ project_id: input.projectID, directory, type: "main", primary: true, strategy: null })
            .onConflictDoUpdate({
              target: [ProjectDirectoryTable.project_id, ProjectDirectoryTable.directory],
              set: { type: "main", primary: true },
            })
            .run()
          yield* tx
            .update(ProjectTable)
            .set({ worktree, vcs: vcs?.type })
            .where(eq(ProjectTable.id, input.projectID))
            .run()
        }),
      ).pipe(Effect.orDie)
    })

    const commit = Effect.fn("Project.commit")(function* (input: { store: AbsolutePath; id: ID }) {
      yield* fs.writeFileString(path.join(input.store, "opencode"), input.id).pipe(Effect.ignore)
    })

    return Service.of({ directories, resolve, attach, detach, setPrimary, commit })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer: layer,
  deps: [FSUtil.node, Git.node, ProjectDirectories.node, Database.node],
})

import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { WorkspaceDirectories } from "@opencode-ai/core/control-plane/directories"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./glob.txt"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "The glob pattern to match files against" }),
  path: Schema.optional(Schema.String).annotate({
    description: `The directory to search in. If not specified, the pattern is searched across every directory attached to the workspace, with results grouped by directory.`,
  }),
})

export const GlobTool = Tool.define(
  "glob",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    const workspaceDirectories = yield* WorkspaceDirectories.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { pattern: string; path?: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const ins = yield* InstanceState.context
          yield* ctx.ask({
            permission: "glob",
            patterns: [params.pattern],
            always: ["*"],
            metadata: {
              pattern: params.pattern,
              path: params.path,
            },
          })

          // A specific path scopes the search to a single directory.
          if (params.path) {
            let search = params.path
            search = path.isAbsolute(search) ? search : path.resolve(ins.directory, search)
            const info = yield* fs.stat(search).pipe(Effect.catch(() => Effect.succeed(undefined)))
            if (info?.type === "File") {
              throw new Error(`glob path must be a directory: ${search}`)
            }
            yield* assertExternalDirectoryEffect(ctx, search, {
              bypass: false,
              kind: "directory",
            })

            const limit = 100
            const files = yield* ripgrep.glob({ cwd: search, pattern: params.pattern, limit })
            const truncated = files.length === limit

            const output = []
            if (files.length === 0) output.push("No files found")
            if (files.length > 0) {
              output.push(...files.map((file) => path.resolve(search, file.path)))
              if (truncated) {
                output.push("")
                output.push(
                  `(Results are truncated: showing first ${limit} results. Consider using a more specific path or pattern.)`,
                )
              }
            }

            return {
              title: path.relative(ins.worktree, search),
              metadata: {
                count: files.length,
                truncated,
              },
              output: output.join("\n"),
            }
          }

          // No path: search across every directory attached to the workspace.
          const directories = yield* resolveSearchDirectories(workspaceDirectories, ins)
          if (directories.length === 0) {
            return { title: params.pattern, metadata: { count: 0, truncated: false }, output: "No files found" }
          }

          const limit = 100
          const grouped = yield* ripgrep.globMulti({ directories, pattern: params.pattern, limit })

          const total = grouped.reduce((sum, group) => sum + group.entries.length, 0)
          const truncated = total >= limit

          const output = []
          if (total === 0) output.push("No files found")
          if (total > 0) {
            for (const group of grouped) {
              if (group.entries.length === 0) continue
              output.push(path.isAbsolute(group.directory) ? path.basename(group.directory) : group.directory)
              for (const entry of group.entries) {
                output.push(path.resolve(group.directory, entry.path))
              }
            }
            if (truncated) {
              output.push("")
              output.push(
                `(Results are truncated: showing first ${limit} results. Consider using a more specific path or pattern.)`,
              )
            }
          }

          return {
            title: params.pattern,
            metadata: {
              count: total,
              truncated,
            },
            output: output.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

function resolveSearchDirectories(
  workspaceDirectories: WorkspaceDirectories.Interface,
  ins: { directory: string; worktree: string },
) {
  return Effect.gen(function* () {
    const workspaceID = yield* InstanceState.workspaceID
    const attached = workspaceID
      ? yield* workspaceDirectories.list(workspaceID).pipe(Effect.catch(() => Effect.succeed([])))
      : []
    const seen = new Set<string>()
    const directories = [ins.directory, ...attached.map((entry) => entry.directory)]
    const result: string[] = []
    for (const directory of directories) {
      const resolved = FSUtil.resolve(directory)
      if (!seen.has(resolved)) {
        seen.add(resolved)
        result.push(resolved)
      }
    }
    return result
  })
}

import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { WorkspaceDirectories } from "@opencode-ai/core/control-plane/directories"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./grep.txt"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "The regex pattern to search for in file contents" }),
  path: Schema.optional(Schema.String).annotate({
    description:
      "The directory to search in. When omitted, the pattern is searched across every directory attached to the workspace, with results grouped by directory.",
  }),
  include: Schema.optional(Schema.String).annotate({
    description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
  }),
})

export const GrepTool = Tool.define(
  "grep",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    const workspaceDirectories = yield* WorkspaceDirectories.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { pattern: string; path?: string; include?: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const empty = {
            title: params.pattern,
            metadata: { matches: 0, truncated: false },
            output: "No files found",
          }
          if (!params.pattern) {
            throw new Error("pattern is required")
          }

          yield* ctx.ask({
            permission: "grep",
            patterns: [params.pattern],
            always: ["*"],
            metadata: {
              pattern: params.pattern,
              path: params.path,
              include: params.include,
            },
          })

          const ins = yield* InstanceState.context

          // A specific path scopes the search to a single directory.
          if (params.path) {
            const requested = path.isAbsolute(params.path) ? params.path : path.join(ins.directory, params.path)
            const requestedInfo = yield* fs.stat(requested).pipe(Effect.catch(() => Effect.succeed(undefined)))
            yield* assertExternalDirectoryEffect(ctx, requested, {
              bypass: false,
              kind: requestedInfo?.type === "Directory" ? "directory" : "file",
            })

            const search = FSUtil.resolve(requested)
            const info = yield* fs.stat(search).pipe(Effect.catch(() => Effect.succeed(undefined)))
            const cwd = info?.type === "Directory" ? search : path.dirname(search)
            const result = yield* ripgrep.grep({
              cwd,
              pattern: params.pattern,
              include: params.include,
              limit: 100,
            })
            if (result.length === 0) return empty

            const rows = result.map((item) => ({
              path: path.resolve(requestedInfo?.type === "Directory" ? requested : path.dirname(requested), item.entry.path),
              line: item.line,
              text: item.text,
            }))

            return formatResults(rows, 100, params.pattern)
          }

          // No path: search across every directory attached to the workspace.
          const directories = yield* resolveSearchDirectories(workspaceDirectories, ins)
          if (directories.length === 0) return empty

          const grouped = yield* ripgrep.grepMulti({
            directories,
            pattern: params.pattern,
            include: params.include,
            limit: 100,
          })

          const total = grouped.reduce((sum, group) => sum + group.matches.length, 0)
          if (total === 0) return empty

          return formatGroupedResults(grouped, 100, params.pattern)
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

function formatResults(rows: { path: string; line: number; text: string }[], limit: number, pattern: string) {
  const truncated = rows.length === limit
  const total = rows.length
  const hasMore = truncated

  const output = [`Found ${total} matches${hasMore ? " (more matches available)" : ""}`]

  let current = ""
  for (const match of rows) {
    if (current !== match.path) {
      if (current !== "") output.push("")
      current = match.path
      output.push(`${match.path}:`)
    }
    output.push(`  Line ${match.line}: ${match.text}`)
  }

  if (truncated) {
    output.push("")
    output.push("(Results truncated. Consider using a more specific path or pattern.)")
  }

  return {
    title: pattern,
    metadata: {
      matches: total,
      truncated,
    },
    output: output.join("\n"),
  }
}

function formatGroupedResults(
  grouped: readonly Ripgrep.MultiGrepResult[],
  limit: number,
  pattern: string,
) {
  const total = grouped.reduce((sum, group) => sum + group.matches.length, 0)
  const truncated = total >= limit

  const output = [`Found ${total} matches${truncated ? " (more matches available)" : ""}`]

  for (const group of grouped) {
    if (group.matches.length === 0) continue
    output.push("")
    output.push(path.isAbsolute(group.directory) ? path.basename(group.directory) : group.directory)
    for (const match of group.matches) {
      output.push(`  ${match.entry.path}:`)
      output.push(`    Line ${match.line}: ${match.text}`)
    }
  }

  if (truncated) {
    output.push("")
    output.push("(Results truncated. Consider using a more specific path or pattern.)")
  }

  return {
    title: pattern,
    metadata: {
      matches: total,
      truncated,
    },
    output: output.join("\n"),
  }
}

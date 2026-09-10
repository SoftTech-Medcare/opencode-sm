import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { WorkspaceDirectories } from "@opencode-ai/core/control-plane/directories"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./grep.txt"
import * as Tool from "./tool"

// WorkspaceDirectories is optional for grep - if not provided, fall back to single-directory search

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "The regex pattern to search for in file contents" }),
  path: Schema.optional(Schema.String).annotate({
    description: "The directory to search in. Defaults to the current working directory.",
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

          // If a specific path is provided, search only in that directory
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

          // No path specified: use single-directory grep (workspace-aware search coming in next phase)
          const result = yield* ripgrep.grep({
            cwd: ins.directory,
            pattern: params.pattern,
            include: params.include,
            limit: 100,
          })
          if (result.length === 0) return empty

          const rows = result.map((item) => ({
            path: path.resolve(ins.directory, item.entry.path),
            line: item.line,
            text: item.text,
          }))

          return formatResults(rows, 100, params.pattern)
        }).pipe(Effect.orDie),
    }
  }),
)

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

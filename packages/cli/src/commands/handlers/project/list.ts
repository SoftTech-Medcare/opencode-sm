import { EOL } from "node:os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { formatDirectoryTable, resolveProjectID } from "../project"

export default Runtime.handler(
  Commands.commands.project.commands.list,
  Effect.fn("cli.project.list")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const projectID = yield* Effect.tryPromise(() => resolveProjectID(client, Option.getOrUndefined(input.project)))
    const response = yield* Effect.tryPromise(() =>
      client.project.directories({ projectID }, { throwOnError: true }),
    )
    const directories = response.data ?? []
    if (input.format === "json") return yield* Effect.sync(() => process.stdout.write(JSON.stringify(directories, null, 2) + EOL))
    return yield* Effect.sync(() => process.stdout.write(formatDirectoryTable(directories) + EOL))
  }),
)

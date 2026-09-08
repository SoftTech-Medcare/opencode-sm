import { EOL } from "node:os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { resolveProjectID } from "../project"

export default Runtime.handler(
  Commands.commands.project.commands.attach,
  Effect.fn("cli.project.attach")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const projectID = yield* Effect.tryPromise(() => resolveProjectID(client, Option.getOrUndefined(input.project)))
    yield* Effect.tryPromise(() =>
      client.project.directories2.attach({
        projectID,
        body_directory: input.directory,
        type: "attached",
        primary: false,
      }),
    )
    return yield* Effect.sync(() =>
      process.stdout.write(`Attached ${input.directory} to project ${projectID}` + EOL),
    )
  }),
)

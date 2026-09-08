import { EOL } from "node:os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { resolveProjectID } from "../project"

export default Runtime.handler(
  Commands.commands.project.commands.detach,
  Effect.fn("cli.project.detach")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const projectID = yield* Effect.tryPromise(() => resolveProjectID(client, Option.getOrUndefined(input.project)))
    yield* Effect.tryPromise(() =>
      client.project.directories2.detach({ projectID, body_directory: input.directory }),
    )
    return yield* Effect.sync(() =>
      process.stdout.write(`Detached ${input.directory} from project ${projectID}` + EOL),
    )
  }),
)

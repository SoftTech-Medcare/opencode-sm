import { Argument, Flag } from "effect/unstable/cli"
import { Spec } from "../framework/spec"

declare const OPENCODE_CLI_NAME: string | undefined

export const Commands = Spec.make(typeof OPENCODE_CLI_NAME === "string" ? OPENCODE_CLI_NAME : "opencode", {
  description: "OpenCode 2.0 preview command line interface",
  commands: [
    Spec.make("api", {
      description: "Make a request to the running server",
      params: {
        request: Argument.string("operation | method path").pipe(
          Argument.withDescription("OpenAPI operation ID, or an HTTP method followed by a path"),
          Argument.variadic({ min: 1, max: 2 }),
        ),
        data: Flag.string("data").pipe(Flag.withAlias("d"), Flag.withDescription("Request body"), Flag.optional),
        header: Flag.string("header").pipe(
          Flag.withAlias("H"),
          Flag.withDescription("Request header in name:value form"),
          Flag.atMost(100),
        ),
        param: Flag.keyValuePair("param").pipe(Flag.withDescription("OpenAPI path or query parameter"), Flag.optional),
      },
    }),
    Spec.make("debug", {
      description: "Debugging and troubleshooting tools",
      commands: [Spec.make("agents", { description: "List all agents" })],
    }),
    Spec.make("project", {
      description: "Manage project directories",
      commands: [
        Spec.make("list", {
          description: "List directories for the project",
          params: {
            project: Flag.string("project").pipe(
              Flag.withDescription("Project ID (defaults to the current project)"),
              Flag.optional,
            ),
            format: Flag.string("format").pipe(
              Flag.withDefault("table"),
              Flag.withDescription("Output format: table or json"),
            ),
          },
        }),
        Spec.make("attach", {
          description: "Attach a directory to the project",
          params: {
            directory: Argument.string("directory").pipe(
              Argument.withDescription("Absolute path to the folder or repository"),
            ),
            project: Flag.string("project").pipe(Flag.optional),
          },
        }),
        Spec.make("detach", {
          description: "Detach a directory from the project",
          params: {
            directory: Argument.string("directory").pipe(
              Argument.withDescription("Absolute path to the folder or repository"),
            ),
            project: Flag.string("project").pipe(Flag.optional),
          },
        }),
        Spec.make("primary", {
          description: "Set the primary directory for the project",
          params: {
            directory: Argument.string("directory").pipe(
              Argument.withDescription("Absolute path to the folder or repository"),
            ),
            project: Flag.string("project").pipe(Flag.optional),
          },
        }),
      ],
    }),
    Spec.make("migrate", { description: "Migrate v1 data to v2" }),
    Spec.make("service", {
      description: "Manage the background server",
      commands: [
        Spec.make("start", { description: "Start the background server" }),
        Spec.make("restart", { description: "Restart the background server" }),
        Spec.make("status", { description: "Show background server status" }),
        Spec.make("stop", { description: "Stop the background server" }),
        Spec.make("password", {
          description: "Get or set the server password",
          params: { value: Argument.string("value").pipe(Argument.optional) },
        }),
      ],
    }),
    Spec.make("serve", {
      description: "Start the v2 API server",
      params: {
        hostname: Flag.string("hostname").pipe(Flag.withDefault("127.0.0.1")),
        port: Flag.integer("port").pipe(Flag.optional),
        register: Flag.boolean("register").pipe(Flag.withDefault(false)),
      },
    }),
  ],
})

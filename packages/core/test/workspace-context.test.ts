import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Location } from "@opencode-ai/core/location"
import { WorkspaceDirectories } from "@opencode-ai/core/control-plane/directories"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { WorkspaceV2 } from "@opencode-ai/core/workspace"
import { SystemContext } from "@opencode-ai/core/system-context"
import { SystemContextRegistry } from "@opencode-ai/core/system-context/registry"
import { WorkspaceContext } from "@opencode-ai/core/workspace-context"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

const workspaceID = WorkspaceV2.ID.make("wrk_test")
const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of({
    directory: AbsolutePath.make("/repo/packages/app"),
    workspaceID,
    directories: [
      AbsolutePath.make("/repo/packages/app"),
      AbsolutePath.make("/repo/packages/api"),
      AbsolutePath.make("/repo/infra"),
    ],
    project: { id: "proj_1" as any, directory: AbsolutePath.make("/repo") },
    vcs: { type: "git", store: AbsolutePath.make("/repo/.git") },
  }),
)

const workspaceDirectoryLayer = Layer.succeed(
  WorkspaceDirectories.Service,
  WorkspaceDirectories.Service.of({
    list: () =>
      Effect.succeed([
        { directory: AbsolutePath.make("/repo/packages/api"), role: "backend", primary: false },
        { directory: AbsolutePath.make("/repo/infra"), role: "infrastructure", primary: false },
      ]),
    find: () => Effect.succeed(undefined),
    get: () => Effect.succeed(undefined),
    contains: () => Effect.succeed(false),
    attach: () => Effect.succeed(true),
    detach: () => Effect.succeed(true),
    setPrimary: () => Effect.void,
  }),
)

const workspaceLayer = AppNodeBuilder.build(
  LayerNode.group([SystemContextRegistry.node, WorkspaceContext.node]),
  [
    [Location.node, locationLayer],
    [WorkspaceDirectories.node, workspaceDirectoryLayer],
  ],
)

const load = SystemContextRegistry.Service.pipe(
  Effect.flatMap((service) => service.load()),
  Effect.provide(workspaceLayer),
)

describe("WorkspaceContext", () => {
  it.effect("provides multi-directory structure with roles and primary marker", () =>
    Effect.gen(function* () {
      const initialized = yield* SystemContext.initialize(yield* load)
      const baseline = initialized.baseline

      expect(baseline).toContain("This project is organized across multiple directories")
      expect(baseline).toContain("/repo/packages/app")
      expect(baseline).toContain("/repo/packages/api")
      expect(baseline).toContain("/repo/infra")
      expect(baseline).toContain("[backend]")
      expect(baseline).toContain("[infrastructure]")
      expect(baseline).toContain("primary working directory is app")
    }),
  )

  it.effect("omits context when only a single directory is present", () =>
    Effect.gen(function* () {
      const single = Layer.succeed(
        Location.Service,
        Location.Service.of({
          directory: AbsolutePath.make("/repo/packages/app"),
          workspaceID,
          directories: [AbsolutePath.make("/repo/packages/app")],
          project: { id: "proj_1" as any, directory: AbsolutePath.make("/repo") },
          vcs: { type: "git", store: AbsolutePath.make("/repo/.git") },
        }),
      )
      const context = yield* SystemContextRegistry.Service.pipe(
        Effect.flatMap((service) => service.load()),
        Effect.provide(
          AppNodeBuilder.build(LayerNode.group([SystemContextRegistry.node, WorkspaceContext.node]), [
            [Location.node, single],
            [WorkspaceDirectories.node, workspaceDirectoryLayer],
          ]),
        ),
      )
      const initialized = yield* SystemContext.initialize(context)
      expect(initialized.baseline).toBe("")
    }),
  )
})

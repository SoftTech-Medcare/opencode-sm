import { Context, Effect, Layer } from "effect"
import { Info, Ref, response } from "@opencode-ai/schema/location"
import { Project } from "./project"
import { ProjectDirectories } from "./project/directories"
import { LayerNode } from "./effect/layer-node"
import { makeLocationNode, tags } from "./effect/app-node"

export * as Location from "./location"

export { Info, Ref, response }

export interface Interface extends Info {
  readonly vcs?: Project.Vcs
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Location") {}

export const node = LayerNode.unbound(Service, tags.values.location)

const layer = (ref: Ref) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const project = yield* Project.Service
      const projectDirectories = yield* ProjectDirectories.Service
      const resolved = yield* project.resolve(ref.directory)
      const rows = yield* projectDirectories.list(resolved.id)
      const directories = rows.length > 0 ? rows.map((row) => row.directory) : [ref.directory]
      return Service.of({
        directory: ref.directory,
        workspaceID: ref.workspaceID,
        directories,
        project: { id: resolved.id, directory: resolved.directory },
        vcs: resolved.vcs,
      })
    }),
  )

export const boundNode = (ref: Ref) =>
  makeLocationNode({
    service: Service,
    layer: layer(ref),
    deps: [Project.node, ProjectDirectories.node],
  })

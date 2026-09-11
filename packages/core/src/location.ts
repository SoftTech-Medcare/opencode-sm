import { Context, Effect, Layer } from "effect"
import { Info, Ref, response } from "@opencode-ai/schema/location"
import { AbsolutePath } from "./schema"
import { Project } from "./project"
import { ProjectDirectories } from "./project/directories"
import { WorkspaceDirectories } from "./control-plane/directories"
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
      const workspaceDirectories = yield* WorkspaceDirectories.Service
      const resolved = yield* project.resolve(ref.directory)

      // Collect directories from both project and workspace sources
      const projectRows = yield* projectDirectories.list(resolved.id)
      const projectDirs = projectRows.map((row) => row.directory)

      let workspaceDirs: AbsolutePath[] = []
      if (ref.workspaceID) {
        const wsRows = yield* workspaceDirectories.list(ref.workspaceID)
        workspaceDirs = wsRows.map((row) => row.directory)
      }

      // Merge directories, avoiding duplicates
      const allDirs = new Set([...projectDirs, ...workspaceDirs])
      const directories = allDirs.size > 0 ? [...allDirs] : [ref.directory]

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
    deps: [Project.node, ProjectDirectories.node, WorkspaceDirectories.node],
  })

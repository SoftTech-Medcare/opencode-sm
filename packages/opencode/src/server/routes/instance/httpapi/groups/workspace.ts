import { Workspace } from "@/control-plane/workspace"
import { WorkspaceAdapterEntry } from "@/control-plane/types"
import { WorkspaceDirectories } from "@opencode-ai/core/control-plane/directories"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Schema, Struct } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { ApiVcsApplyError } from "./instance"
import { ApiNotFoundError } from "../errors"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

export const WorkspaceDirectoriesAttachPayload = Schema.Struct({
  directory: AbsolutePath,
  type: Schema.Literals(["main", "attached"]).pipe(Schema.optional),
  primary: Schema.Boolean.pipe(Schema.optional),
})

export const WorkspaceDirectoriesDetachPayload = Schema.Struct({
  directory: AbsolutePath,
})

export const WorkspaceDirectoriesPrimaryPayload = Schema.Struct({
  directory: AbsolutePath,
})

export type WorkspaceDirectoriesAttachPayload = typeof WorkspaceDirectoriesAttachPayload.Type
export type WorkspaceDirectoriesDetachPayload = typeof WorkspaceDirectoriesDetachPayload.Type
export type WorkspaceDirectoriesPrimaryPayload = typeof WorkspaceDirectoriesPrimaryPayload.Type

const root = "/experimental/workspace"
export const CreatePayload = Schema.Struct(Struct.omit(Workspace.CreateInput.fields, ["projectID"]))
export const WarpPayload = Schema.Struct({
  id: Schema.NullOr(Workspace.Info.fields.id),
  sessionID: Workspace.SessionWarpInput.fields.sessionID,
  copyChanges: Workspace.SessionWarpInput.fields.copyChanges,
})

export class ApiWorkspaceWarpError extends Schema.ErrorClass<ApiWorkspaceWarpError>("WorkspaceWarpError")(
  {
    name: Schema.Literal("WorkspaceWarpError"),
    data: Schema.Struct({
      message: Schema.String,
    }),
  },
  { httpApiStatus: 400 },
) {}

export class ApiWorkspaceCreateError extends Schema.ErrorClass<ApiWorkspaceCreateError>("WorkspaceCreateError")(
  {
    name: Schema.Literal("WorkspaceCreateError"),
    data: Schema.Struct({
      message: Schema.String,
    }),
  },
  { httpApiStatus: 400 },
) {}

export const WorkspacePaths = {
  adapters: `${root}/adapter`,
  list: root,
  syncList: `${root}/sync-list`,
  status: `${root}/status`,
  remove: `${root}/:id`,
  warp: `${root}/warp`,
} as const

export const WorkspaceApi = HttpApi.make("workspace")
  .add(
    HttpApiGroup.make("workspace")
      .add(
        HttpApiEndpoint.get("adapters", WorkspacePaths.adapters, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(WorkspaceAdapterEntry), "Workspace adapters"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.adapter.list",
            summary: "List workspace adapters",
            description: "List all available workspace adapters for the current project.",
          }),
        ),
        HttpApiEndpoint.get("list", WorkspacePaths.list, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Workspace.Info), "Workspaces"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.list",
            summary: "List workspaces",
            description: "List all workspaces.",
          }),
        ),
        HttpApiEndpoint.post("create", WorkspacePaths.list, {
          query: WorkspaceRoutingQuery,
          payload: CreatePayload,
          success: described(Workspace.Info, "Workspace created"),
          error: [ApiWorkspaceCreateError, HttpApiError.BadRequest],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.create",
            summary: "Create workspace",
            description: "Create a workspace for the current project.",
          }),
        ),
        HttpApiEndpoint.post("syncList", WorkspacePaths.syncList, {
          query: WorkspaceRoutingQuery,
          success: described(HttpApiSchema.NoContent, "Workspace list synced"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.syncList",
            summary: "Sync workspace list",
            description: "Register missing workspaces returned by workspace adapters.",
          }),
        ),
        HttpApiEndpoint.get("status", WorkspacePaths.status, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Workspace.ConnectionStatus), "Workspace status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.status",
            summary: "Workspace status",
            description: "Get connection status for workspaces in the current project.",
          }),
        ),
        HttpApiEndpoint.delete("remove", WorkspacePaths.remove, {
          params: { id: Workspace.Info.fields.id },
          query: WorkspaceRoutingQuery,
          success: described(Schema.UndefinedOr(Workspace.Info), "Workspace removed"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.remove",
            summary: "Remove workspace",
            description: "Remove an existing workspace.",
          }),
        ),
        HttpApiEndpoint.post("warp", WorkspacePaths.warp, {
          query: WorkspaceRoutingQuery,
          payload: WarpPayload,
          success: described(HttpApiSchema.NoContent, "Session warped"),
          error: [ApiWorkspaceWarpError, ApiVcsApplyError, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.warp",
            summary: "Warp session into workspace",
            description: "Move a session's sync history into the target workspace, or detach it to the local project.",
          }),
        ),
        HttpApiEndpoint.get("directories", `${root}/:workspaceID/directories`, {
          params: { workspaceID: Workspace.Info.fields.id },
          success: described(WorkspaceDirectories.ListOutput, "Workspace directories"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.directories.list",
            summary: "List workspace directories",
            description: "List directories attached to a workspace, including their detected roles.",
          }),
        ),
        HttpApiEndpoint.post("directories.attach", `${root}/:workspaceID/directories`, {
          params: { workspaceID: Workspace.Info.fields.id },
          payload: WorkspaceDirectoriesAttachPayload,
          success: described(WorkspaceDirectories.ListOutput, "Workspace directories after attach"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.directories.attach",
            summary: "Attach workspace directory",
            description: "Attach a directory to a workspace.",
          }),
        ),
        HttpApiEndpoint.delete("directories.detach", `${root}/:workspaceID/directories`, {
          params: { workspaceID: Workspace.Info.fields.id },
          payload: WorkspaceDirectoriesDetachPayload,
          success: described(WorkspaceDirectories.ListOutput, "Workspace directories after detach"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.directories.detach",
            summary: "Detach workspace directory",
            description: "Detach a directory from a workspace.",
          }),
        ),
        HttpApiEndpoint.post("directories.primary", `${root}/:workspaceID/directories/primary`, {
          params: { workspaceID: Workspace.Info.fields.id },
          payload: WorkspaceDirectoriesPrimaryPayload,
          success: described(WorkspaceDirectories.ListOutput, "Workspace directories after setting primary"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "experimental.workspace.directories.primary",
            summary: "Set primary workspace directory",
            description: "Set the primary directory for a workspace.",
          }),
        ),
      )
      .annotateMerge(OpenApi.annotations({ title: "workspace", description: "Experimental HttpApi workspace routes." }))
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )

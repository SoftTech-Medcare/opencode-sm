import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { WorkspaceTable } from "./workspace.sql"
import { WorkspaceV2 } from "../workspace"

export const WorkspaceDirectoryTable = sqliteTable("workspace_directory", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspace_id: text()
    .$type<WorkspaceV2.ID>()
    .notNull()
    .references(() => WorkspaceTable.id, { onDelete: "cascade" }),
  directory: text().notNull(),
  role: text(), // auto-detected: "frontend", "backend", "infrastructure", etc.
  primary: integer({ mode: "boolean" }).notNull().default(false),
  time_created: integer()
    .notNull()
    .$default(() => Date.now()),
})
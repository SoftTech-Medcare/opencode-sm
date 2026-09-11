import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260911122815_friendly_may_parker",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_workspace_directory\` (
          \`id\` integer PRIMARY KEY AUTOINCREMENT,
          \`workspace_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`role\` text,
          \`primary\` integer DEFAULT false NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_workspace_directory_workspace_id_workspace_id_fk\` FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspace\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`workspace_directory_workspace_id_directory_unique\` UNIQUE(\`workspace_id\`,\`directory\`)
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_workspace_directory\`(\`id\`, \`workspace_id\`, \`directory\`, \`role\`, \`primary\`, \`time_created\`) SELECT \`id\`, \`workspace_id\`, \`directory\`, \`role\`, \`primary\`, \`time_created\` FROM \`workspace_directory\`;`,
      )
      yield* tx.run(`DROP TABLE \`workspace_directory\`;`)
      yield* tx.run(`ALTER TABLE \`__new_workspace_directory\` RENAME TO \`workspace_directory\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
    })
  },
} satisfies DatabaseMigration.Migration

import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260908141918_polite_loners",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`project_directory\` ADD \`primary\` integer NOT NULL DEFAULT 0;`)
      yield* tx.run(`
        INSERT INTO \`project_directory\` (\`project_id\`, \`directory\`, \`type\`, \`primary\`, \`strategy\`)
        SELECT \`id\`, \`worktree\`, 'main', 1, NULL FROM \`project\` AS p
        WHERE NOT EXISTS (
          SELECT 1 FROM \`project_directory\` AS pd
          WHERE pd.\`project_id\` = p.\`id\` AND pd.\`directory\` = p.\`worktree\`
        );
      `)
      yield* tx.run(`
        INSERT INTO \`project_directory\` (\`project_id\`, \`directory\`, \`type\`, \`primary\`, \`strategy\`)
        SELECT p.\`id\`, json.\`value\`, 'attached', 0, NULL FROM \`project\` AS p, json_each(p.\`sandboxes\`) AS json
        WHERE json.\`value\` IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM \`project_directory\` AS pd
          WHERE pd.\`project_id\` = p.\`id\` AND pd.\`directory\` = json.\`value\`
        );
      `)
      yield* tx.run(`
        UPDATE \`project_directory\` SET \`type\` = 'main', \`primary\` = 1
        WHERE \`directory\` IN (SELECT \`worktree\` FROM \`project\`);
      `)
      yield* tx.run(`
        UPDATE \`project_directory\` SET \`type\` = 'attached', \`primary\` = 0
        WHERE \`type\` IS NULL OR \`type\` <> 'main';
      `)
    })
  },
} satisfies DatabaseMigration.Migration

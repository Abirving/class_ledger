import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
const pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  c = await pool.connect();
try {
  await c.query("SELECT pg_advisory_lock(8947321)");
  await c.query(
    "CREATE TABLE IF NOT EXISTS classledger_migration(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT now())",
  );
  for (const name of (await readdir("prisma/migrations")).sort()) {
    if (
      !(
        await c.query("SELECT name FROM classledger_migration WHERE name=$1", [
          name,
        ])
      ).rowCount
    ) {
      await c.query("BEGIN");
      try {
        await c.query(
          await readFile(
            "prisma/migrations/" + name + "/migration.sql",
            "utf8",
          ),
        );
        await c.query("INSERT INTO classledger_migration(name) VALUES($1)", [
          name,
        ]);
        await c.query("COMMIT");
        console.log("Applied " + name);
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
  }
} finally {
  await c.query("SELECT pg_advisory_unlock(8947321)");
  c.release();
  await pool.end();
}

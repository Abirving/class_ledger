import { Pool } from "pg";
import { sql } from "./contracts";
import type { Database, Statement, Storage } from "./contracts";
export const postgresSql = (q: string) => {
  let n = 0;
  return q.replace(/\?/g, () => "$" + ++n);
};
export class Postgres implements Database {
  constructor(public pool: Pool) {}
  async all<T = any>(q: string, p: any[] = []): Promise<T[]> {
    return (await this.pool.query(postgresSql(q), p)).rows;
  }
  async batch(items: Statement[]) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      for (const i of items) await c.query(postgresSql(i.sql), i.params);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
// Files are stored in PostgreSQL so the app runs on stateless hosts (for
// example Vercel) where the local filesystem is read-only and ephemeral.
export class PostgresStorage implements Storage {
  constructor(private db: Database) {}
  async put(key: string, b: Uint8Array, type?: string) {
    await this.db.batch([
      sql(
        "INSERT INTO object_blob(key,data,type,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,type=excluded.type,updated_at=excluded.updated_at",
        key,
        Buffer.from(b),
        type || null,
        new Date().toISOString(),
      ),
    ]);
  }
  async get(key: string) {
    const rows = await this.db.all<{ data: Buffer }>(
      "SELECT data FROM object_blob WHERE key=?",
      [key],
    );
    return rows.length ? new Uint8Array(rows[0].data) : null;
  }
}

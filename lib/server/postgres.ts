import { Pool } from "pg";
import { sql } from "./contracts";
import type { Database, Statement, Storage } from "./contracts";
// Rewrites positional `?` placeholders into PostgreSQL's `$n` form. A plain
// global replace would also rewrite question marks that live inside string
// literals, quoted identifiers, comments or dollar-quoted blocks, which would
// silently shift every following parameter. This scans the statement instead
// and only numbers placeholders found in real SQL code.
export const postgresSql = (q: string) => {
  let n = 0,
    out = "",
    i = 0;
  while (i < q.length) {
    const c = q[i];
    if (c === "'" || c === '"') {
      const quote = c;
      out += c;
      i++;
      while (i < q.length) {
        const d = q[i];
        if (d === "\\") {
          out += d + (q[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (d === quote) {
          if (q[i + 1] === quote) {
            out += d + d;
            i += 2;
            continue;
          }
          out += d;
          i++;
          break;
        }
        out += d;
        i++;
      }
      continue;
    }
    if (c === "-" && q[i + 1] === "-") {
      const end = q.indexOf("\n", i);
      if (end < 0) {
        out += q.slice(i);
        break;
      }
      out += q.slice(i, end);
      i = end;
      continue;
    }
    if (c === "/" && q[i + 1] === "*") {
      let depth = 1,
        j = i + 2;
      while (j < q.length && depth > 0) {
        if (q[j] === "/" && q[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (q[j] === "*" && q[j + 1] === "/") {
          depth--;
          j += 2;
        } else j++;
      }
      out += q.slice(i, j);
      i = j;
      continue;
    }
    if (c === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(q.slice(i))?.[0];
      if (tag) {
        const end = q.indexOf(tag, i + tag.length);
        if (end >= 0) {
          out += q.slice(i, end + tag.length);
          i = end + tag.length;
          continue;
        }
      }
    }
    if (c === "?") {
      out += "$" + ++n;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
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
  async delete(key: string) {
    await this.db.batch([sql("DELETE FROM object_blob WHERE key=?", key)]);
  }
}

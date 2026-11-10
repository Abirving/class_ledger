import { Pool } from "pg";
import type { Queue } from "bullmq";
import { Postgres, PostgresStorage } from "./postgres";
import { FONT_BASE64 } from "./font-data";
import type { Runtime } from "./contracts";
// Serverless instances are short-lived and horizontally scaled, so a large
// per-instance pool would exhaust the database's connection limit. Default to
// a single connection (each query is awaited in turn) and allow an override.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 1),
});
export function redisConnection() {
  const u = new URL(process.env.REDIS_URL || "redis://localhost:6379");
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
let queue: Queue | undefined;
export async function runtime(_request?: Request): Promise<Runtime> {
  const db = new Postgres(pool);
  const base: Runtime = {
    db,
    storage: new PostgresStorage(db),
    localAuth: true,
    // Embedded base64 font so the renderer needs no writable disk or extra
    // traced asset on stateless hosts.
    font: async () => Uint8Array.from(atob(FONT_BASE64), (c) => c.charCodeAt(0)),
    // waitUntil is intentionally left unset here: the route handler installs
    // Next's request-scoped `after` (real background work) in its place.
  };
  // Redis is optional. Without REDIS_URL the report worker is skipped and
  // batches are rendered in-process when the app calls the process endpoint.
  if (!process.env.REDIS_URL) return base;
  return {
    ...base,
    enqueue: async (id) => {
      // Loaded lazily so the queue client (and its connection handling) is not
      // pulled in on deployments that render reports in-process.
      queue ??= new (await import("bullmq")).Queue("classledger-reports", {
        connection: redisConnection(),
      });
      const existing = await queue.getJob(id);
      if (existing) {
        if ((await existing.getState()) === "failed") await existing.retry();
        return;
      }
      await queue.add(
        "render",
        { id },
        {
          jobId: id,
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    },
  };
}

import { Pool } from "pg";
import { Queue } from "bullmq";
import { Postgres, PostgresStorage } from "./postgres";
import { FONT_BASE64 } from "./font-data";
import type { Runtime } from "./contracts";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
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
    waitUntil: (job) => void job.catch(() => {}),
  };
  // Redis is optional. Without REDIS_URL the report worker is skipped and
  // batches are rendered in-process when the app calls the process endpoint.
  if (!process.env.REDIS_URL) return base;
  return {
    ...base,
    enqueue: async (id) => {
      queue ??= new Queue("classledger-reports", {
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

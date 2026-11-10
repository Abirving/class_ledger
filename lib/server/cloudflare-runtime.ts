import { env, waitUntil } from "cloudflare:workers";
import type { Runtime, Database, Statement } from "./contracts";
import { FONT_BASE64 } from "./font-data";
export async function runtime(request: Request): Promise<Runtime> {
  const e = env as unknown as { DB: D1Database; BUCKET: R2Bucket };
  const db: Database = {
    all: async <T = any>(q: string, p: any[] = []) => {
      const result = await e.DB.prepare(q)
        .bind(...p)
        .all();
      return result.results as T[];
    },
    batch: async (s: Statement[]) => {
      await e.DB.batch(s.map((i) => e.DB.prepare(i.sql).bind(...i.params)));
    },
  };
  return {
    db,
    localAuth: true,
    storage: {
      put: async (k, b, t) => {
        await e.BUCKET.put(k, b, {
          httpMetadata: { contentType: t || "application/octet-stream" },
        });
      },
      get: async (k) => {
        const x = await e.BUCKET.get(k);
        return x ? new Uint8Array(await x.arrayBuffer()) : null;
      },
      delete: async (k) => {
        await e.BUCKET.delete(k);
      },
    },
    waitUntil,
    font: async () =>
      Uint8Array.from(atob(FONT_BASE64), (c) => c.charCodeAt(0)),
  };
}

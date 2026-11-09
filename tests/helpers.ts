import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { Runtime, Database, Statement, Actor } from "../lib/server/contracts";
import { postgresSql } from "../lib/server/postgres";
import { setup } from "../lib/server/seed";
import { handle } from "../lib/server/api";
import { workbook } from "../lib/server/import-files";
export const admin: Actor = {
  id: "admin",
  name: "Test Administrator",
  email: "admin@test.school",
  roles: ["SYSTEM_ADMIN", "APPROVER"],
};
export const principal: Actor = {
  id: "principal",
  name: "Sample Principal",
  email: "principal@demo.school",
  roles: ["APPROVER"],
};
export const teacher: Actor = {
  id: "teacher-MATH",
  name: "Mathematics Teacher",
  email: "math@demo.school",
  roles: ["TEACHER"],
};
export async function fixture() {
  const pg = new PGlite();
  await pg.exec(
    await readFile(
      "prisma/migrations/202611050001_initial/migration.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      "prisma/migrations/202611050002_invariants/migration.sql",
      "utf8",
    ),
  );
  const db: Database = {
    all: async <T = any>(q: string, p: any[] = []) =>
      (await pg.query(postgresSql(q), p)).rows as T[],
    batch: async (items: Statement[]) => {
      await pg.transaction(async (tx) => {
        for (const s of items) await tx.query(postgresSql(s.sql), s.params);
      });
    },
  };
  const files = new Map<string, Uint8Array>();
  const rt: Runtime = {
    db,
    storage: {
      put: async (k, b) => {
        files.set(k, b);
      },
      get: async (k) => files.get(k) || null,
    },
    font: async () =>
      new Uint8Array(await readFile("public/fonts/NotoSansEthiopic.ttf")),
  };
  await setup(rt, admin, "Acacia Academy", true);
  return {
    rt,
    pg,
    files,
    call: async (
      path: string,
      method = "GET",
      body?: any,
      actor: Actor | null = admin,
    ) => {
      const request = new Request("https://classledger.test/api/" + path, {
        method,
        headers:
          body instanceof FormData
            ? {}
            : body
              ? { "Content-Type": "application/json" }
              : {},
        body: body
          ? body instanceof FormData
            ? body
            : JSON.stringify(body)
          : undefined,
      });
      return handle(
        {
          ...rt,
          identity: actor
            ? { id: actor.id, name: actor.name, email: actor.email }
            : undefined,
        },
        request,
      );
    },
  };
}
export const json = async (r: Response) => (await r.json()) as any;
export const xlsxBytes = (rows: unknown[][]) => workbook(rows);

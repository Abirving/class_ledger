import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { Postgres, PostgresStorage } from "../../lib/server/postgres";
import { setup } from "../../lib/server/seed";
const username = process.env.ADMIN_USERNAME,
  password = process.env.ADMIN_PASSWORD;
if (!username || !password || password.length < 12)
  throw new Error(
    "Set ADMIN_USERNAME and ADMIN_PASSWORD (12+ characters) before seeding.",
  );
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const db = new Postgres(pool);
  await setup(
    {
      db,
      storage: new PostgresStorage(db),
      font: async () =>
        new Uint8Array(await readFile("public/fonts/NotoSansEthiopic.ttf")),
    },
    {
      id: crypto.randomUUID(),
      name: process.env.ADMIN_NAME || "School administrator",
      email: username.toLowerCase(),
      roles: ["SYSTEM_ADMIN", "APPROVER"],
    },
    process.env.SCHOOL_NAME || "My School",
    false,
    await bcrypt.hash(password, 12),
  );
  console.log(
    "School configured. Sign in with the administrator username and password.",
  );
} finally {
  await pool.end();
}

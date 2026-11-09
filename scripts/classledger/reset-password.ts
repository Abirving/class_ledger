import { Pool } from "pg";
import bcrypt from "bcryptjs";
const email = process.env.ACCOUNT_EMAIL,
  password = process.env.NEW_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error(
    "Set ACCOUNT_EMAIL and NEW_PASSWORD with at least 12 characters.",
  );
const p = new Pool({ connectionString: process.env.DATABASE_URL }),
  c = await p.connect();
try {
  await c.query("BEGIN");
  const user = (
    await c.query(
      "UPDATE users SET password_hash=$1 WHERE email=$2 RETURNING id",
      [await bcrypt.hash(password, 12), email.toLowerCase()],
    )
  ).rows[0];
  if (!user) throw new Error("Account not found.");
  await c.query("DELETE FROM session WHERE user_id=$1", [user.id]);
  await c.query(
    "INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      crypto.randomUUID(),
      user.id,
      "OPERATOR_PASSWORD_RESET",
      "user",
      user.id,
      "{}",
      new Date().toISOString(),
    ],
  );
  await c.query("COMMIT");
  console.log("Password updated and existing sessions revoked.");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await p.end();
}

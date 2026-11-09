export type Row = Record<string, any>;
export type Statement = { sql: string; params: any[] };
export interface Database {
  all<T = Row>(sql: string, params?: any[]): Promise<T[]>;
  batch(statements: Statement[]): Promise<void>;
}
export interface Storage {
  put(key: string, data: Uint8Array, type?: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}
export interface Runtime {
  db: Database;
  storage: Storage;
  identity?: { id: string; email: string; name: string };
  localAuth?: boolean;
  enqueue?: (id: string) => Promise<void>;
  waitUntil?: (job: Promise<any>) => void;
  font: () => Promise<Uint8Array>;
}
export interface Actor {
  id: string;
  name: string;
  email: string;
  roles: string[];
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const sql = (sql: string, ...params: any[]): Statement => ({
  sql,
  params,
});
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const hash = async (bytes: Uint8Array | string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof bytes === "string"
          ? new TextEncoder().encode(bytes)
          : (bytes as BufferSource),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export const one = async (db: Database, q: string, p: any[] = []) =>
  (await db.all(q, p))[0];
export function demand(
  condition: unknown,
  code: string,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(code, message, status);
}
export function allow(actor: Actor, ...roles: string[]) {
  demand(
    actor.roles.some((r) => roles.includes(r)),
    "FORBIDDEN",
    "You do not have permission for this action.",
    403,
  );
}
export const staff = (a: Actor) =>
  allow(a, "SYSTEM_ADMIN", "REGISTRAR", "APPROVER");
export function guard(q: string, ...p: any[]): Statement[] {
  const id = uid();
  return [
    sql(
      `INSERT INTO transaction_guard(id,ok) VALUES (?,CASE WHEN (${q}) THEN 1 ELSE 0 END)`,
      id,
      ...p,
    ),
    sql("DELETE FROM transaction_guard WHERE id=?", id),
  ];
}
export const audit = (
  actor: Actor,
  action: string,
  type: string,
  id: string,
  detail: unknown = {},
) =>
  sql(
    "INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,detail,created_at) VALUES(?,?,?,?,?,?,?)",
    uid(),
    actor.id,
    action,
    type,
    id,
    JSON.stringify(detail),
    now(),
  );
export const parse = <T = any>(s: string): T => JSON.parse(s);

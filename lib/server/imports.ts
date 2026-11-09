import {
  Runtime,
  Actor,
  one,
  allow,
  demand,
  hash,
  uid,
  now,
  sql,
  guard,
  audit,
  parse,
  Statement,
} from "./contracts";
import { assignment, roster, scope, scopeGuard, bump } from "./data";
import { parseFile, autoMap, validate } from "./import-files";
export async function stage(
  rt: Runtime,
  actor: Actor,
  input: {
    assignmentId: string;
    bytes: Uint8Array;
    filename: string;
    mapping?: Record<string, number>;
    reason?: string;
  },
): Promise<{ id: string; status: string; duplicate?: boolean }> {
  allow(actor, "SYSTEM_ADMIN", "TEACHER");
  const a = await assignment(rt.db, actor, input.assignmentId),
    h = await hash(input.bytes),
    existing = await one(
      rt.db,
      "SELECT id,status FROM import_batch WHERE assignment_id=? AND file_hash=?",
      [a.id, h],
    );
  if (existing)
    return { id: existing.id, status: existing.status, duplicate: true };
  const table = await parseFile(input.bytes, input.filename),
    mapping = input.mapping || autoMap(table.headers);
  demand(
    Number.isInteger(mapping.code) &&
      mapping.code >= 0 &&
      Number.isInteger(mapping.score) &&
      mapping.score >= 0,
    "MAPPING_REQUIRED",
    "Map Student ID and Score columns.",
  );
  const students = await roster(rt.db, a.term_id, a.section_id),
    rows = validate(table, mapping, students, a),
    approved = await one(
      rt.db,
      "SELECT id FROM result_run WHERE term_id=? AND section_id=? AND status='APPROVED'",
      [a.term_id, a.section_id],
    );
  demand(rows.length, "EMPTY_UPLOAD", "The upload has no student rows.");
  demand(
    !approved || (input.reason || "").trim().length >= 8,
    "CORRECTION_REASON_REQUIRED",
    "Explain the correction to the approved results.",
  );
  const id = uid(),
    rev = await scope(rt.db, a.term_id, a.section_id),
    key =
      "imports/" +
      id +
      "/" +
      (input.filename.toLowerCase().endsWith(".docx")
        ? "source.docx"
        : "source.xlsx"),
    omitted = students.filter((s) => !rows.some((r) => r.code === s.code));
  await rt.storage.put(key, input.bytes);
  const status = rows.some((r) => r.errors.length) ? "INVALID" : "STAGED";
  const payload = {
    mapping,
    headers: table.headers,
    counts: {
      rows: rows.length,
      errors: rows.filter((r) => r.errors.length).length,
      missing:
        rows.filter((r) => r.value === null && !r.errors.length).length +
        omitted.length,
    },
    omitted,
    requiresApproval: !!approved,
  };
  await rt.db.batch([
    sql(
      "INSERT INTO import_batch(id,assignment_id,actor_id,source_key,file_hash,filename,status,payload,scope_revision,correction_reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      id,
      a.id,
      actor.id,
      key,
      h,
      input.filename,
      status,
      JSON.stringify(payload),
      rev,
      input.reason || "",
      now(),
    ),
    ...rows.map((r) =>
      sql(
        "INSERT INTO import_row(id,batch_id,line_number,enrollment_id,raw_cells,value,reason,errors,warnings) VALUES(?,?,?,?,?,?,?,?,?)",
        uid(),
        id,
        r.line,
        r.enrollment_id,
        JSON.stringify({ ...r, raw: r.raw }),
        r.value,
        r.reason,
        JSON.stringify(r.errors),
        JSON.stringify(r.warnings),
      ),
    ),
    audit(actor, "IMPORT_STAGED", "import_batch", id, {
      status,
      rows: rows.length,
    }),
  ]);
  return { id, status };
}
export async function commit(rt: Runtime, actor: Actor, id: string) {
  allow(actor, "SYSTEM_ADMIN", "TEACHER");
  const b = await one(rt.db, "SELECT * FROM import_batch WHERE id=?", [id]);
  demand(b, "NOT_FOUND", "Submission not found.", 404);
  const a = await assignment(rt.db, actor, b.assignment_id);
  if (b.status === "COMMITTED") return { id, alreadyCommitted: true };
  demand(
    b.status === "STAGED",
    "INVALID_BATCH",
    "Fix validation errors before submitting.",
  );
  const p = parse(b.payload);
  if (p.requiresApproval) allow(actor, "SYSTEM_ADMIN");
  const rev = await scope(rt.db, a.term_id, a.section_id);
  demand(
    rev === b.scope_revision,
    "STALE_SUBMISSION",
    "Another change occurred. Download current data and stage a revised file.",
    409,
  );
  const rows = await rt.db.all(
      "SELECT * FROM import_row WHERE batch_id=? ORDER BY line_number",
      [id],
    ),
    at = now();
  const s: Statement[] = [
    ...scopeGuard(a.term_id, a.section_id, rev),
    ...guard(
      "EXISTS(SELECT 1 FROM import_batch WHERE id=? AND status='STAGED')",
      id,
    ),
    sql(
      "UPDATE score SET effective=0 WHERE term_id=? AND offering_id=? AND enrollment_id IN(SELECT id FROM enrollment WHERE section_id=?) AND effective=1",
      a.term_id,
      a.offering_id,
      a.section_id,
    ),
  ];
  const old = await rt.db.all(
    "SELECT * FROM score_exception WHERE assignment_id=? AND status!='RESOLVED'",
    [a.id],
  );
  for (const x of old)
    s.push(
      sql(
        "INSERT INTO exception_resolution(id,exception_id,action,justification,actor_id,created_at) VALUES(?,?,?,?,?,?)",
        uid(),
        x.id,
        "REPLACED_BY_SUBMISSION",
        "Replaced by reviewed teacher submission " + id,
        actor.id,
        at,
      ),
    );
  s.push(
    sql(
      "UPDATE score_exception SET status='RESOLVED',resolved_at=?,revision=revision+1 WHERE assignment_id=? AND status!='RESOLVED'",
      at,
      a.id,
    ),
  );
  for (const row of rows) {
    const r = parse(row.raw_cells);
    if (row.value !== null)
      s.push(
        sql(
          "INSERT INTO score(id,enrollment_id,term_id,offering_id,value,source_row_id,actor_id,revision,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
          uid(),
          row.enrollment_id,
          a.term_id,
          a.offering_id,
          String(row.value),
          row.id,
          actor.id,
          rev + 1,
          at,
        ),
      );
    else
      s.push(
        sql(
          "INSERT INTO score_exception(id,enrollment_id,term_id,offering_id,assignment_id,source_row_id,kind,reason,remark,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          uid(),
          row.enrollment_id,
          a.term_id,
          a.offering_id,
          a.id,
          row.id,
          "MISSING_VALUE",
          r.reason,
          r.remark,
          "OPEN",
          at,
        ),
      );
  }
  for (const missing of p.omitted)
    s.push(
      sql(
        "INSERT INTO score_exception(id,enrollment_id,term_id,offering_id,assignment_id,kind,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
        uid(),
        missing.enrollment_id,
        a.term_id,
        a.offering_id,
        a.id,
        "OMITTED_ROW",
        "OPEN",
        at,
      ),
    );
  s.push(
    sql(
      "UPDATE import_batch SET status='COMMITTED',committed_at=? WHERE id=?",
      at,
      id,
    ),
    bump(a.term_id, a.section_id),
    audit(actor, "IMPORT_COMMITTED", "import_batch", id, {
      correctionReason: b.correction_reason,
      rows: rows.length,
    }),
  );
  await rt.db.batch(s);
  return { id, status: "COMMITTED" };
}

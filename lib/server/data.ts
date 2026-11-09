import { Actor, Database, one, demand, allow, guard, sql } from "./contracts";
export async function assignment(db: Database, a: Actor, id: string) {
  const x = await one(
    db,
    `SELECT a.*,o.maximum,o.weight,s.label section,g.label grade,t.year_id,u.name teacher,sub.name subject FROM assignment a JOIN offering o ON o.id=a.offering_id JOIN section s ON s.id=a.section_id JOIN grade g ON g.id=s.grade_id JOIN term t ON t.id=a.term_id JOIN users u ON u.id=a.teacher_id JOIN subject sub ON sub.id=o.subject_id WHERE a.id=?`,
    [id],
  );
  demand(x, "NOT_FOUND", "Assignment not found.", 404);
  if (
    !a.roles.some((r) => ["SYSTEM_ADMIN", "REGISTRAR", "APPROVER"].includes(r))
  )
    demand(
      a.roles.includes("TEACHER") && x.teacher_id === a.id,
      "NOT_ASSIGNED",
      "This assignment is not assigned to you.",
      403,
    );
  return x;
}
export const roster = (db: Database, term: string, section: string) =>
  db.all(
    `SELECT e.id enrollment_id,s.code,s.full_name FROM enrollment e JOIN student s ON s.id=e.student_id JOIN term t ON t.year_id=e.year_id WHERE t.id=? AND e.section_id=? AND e.active=1 AND s.active=1 ORDER BY s.code`,
    [term, section],
  );
export async function scope(db: Database, term: string, section: string) {
  const r = await one(
    db,
    "SELECT revision FROM scope_state WHERE term_id=? AND section_id=?",
    [term, section],
  );
  return Number(r?.revision || 0);
}
export function scopeGuard(term: string, section: string, rev: number) {
  return guard(
    "EXISTS(SELECT 1 FROM scope_state WHERE term_id=? AND section_id=? AND revision=?)",
    term,
    section,
    rev,
  );
}
export const bump = (term: string, section: string) =>
  sql(
    "UPDATE scope_state SET revision=revision+1 WHERE term_id=? AND section_id=?",
    term,
    section,
  );
export async function coverage(db: Database, term: string, section: string) {
  const students = await roster(db, term, section),
    offerings = await db.all(
      `SELECT o.*,s.name FROM offering o JOIN subject s ON s.id=o.subject_id JOIN section sec ON sec.grade_id=o.grade_id WHERE sec.id=? AND o.required=1 ORDER BY o.sort_order`,
      [section],
    );
  const scores = await db.all(
    `SELECT sc.* FROM score sc JOIN enrollment e ON e.id=sc.enrollment_id WHERE sc.term_id=? AND e.section_id=? AND sc.effective=1`,
    [term, section],
  );
  const map = new Map(
    scores.map((s) => [s.enrollment_id + ":" + s.offering_id, s]),
  );
  const missing = students.flatMap((s) =>
    offerings
      .filter((o) => !map.has(s.enrollment_id + ":" + o.id))
      .map((o) => ({
        ...s,
        enrollment_id: s.enrollment_id,
        code: s.code,
        full_name: s.full_name,
        offering_id: o.id,
        subject: o.name,
      })),
  );
  const assignments = await db.all(
    `SELECT a.*,sub.name subject,u.name teacher,(SELECT COUNT(*) FROM import_batch b WHERE b.assignment_id=a.id AND b.status='COMMITTED') submissions FROM assignment a JOIN offering o ON o.id=a.offering_id JOIN subject sub ON sub.id=o.subject_id JOIN users u ON u.id=a.teacher_id WHERE a.term_id=? AND a.section_id=?`,
    [term, section],
  );
  const pending = await one(
    db,
    `SELECT COUNT(*) n FROM import_batch b JOIN assignment a ON a.id=b.assignment_id WHERE a.term_id=? AND a.section_id=? AND b.status IN('STAGED','INVALID') AND NOT EXISTS(SELECT 1 FROM import_batch newer WHERE newer.assignment_id=b.assignment_id AND newer.status='COMMITTED' AND newer.created_at>b.created_at)`,
    [term, section],
  );
  const open = await one(
    db,
    `SELECT COUNT(*) n FROM score_exception x JOIN enrollment e ON e.id=x.enrollment_id WHERE x.term_id=? AND e.section_id=? AND x.status!='RESOLVED'`,
    [term, section],
  );
  const unsubmitted = offerings.filter(
    (o) =>
      !assignments.some(
        (a) => a.offering_id === o.id && Number(a.submissions) > 0,
      ),
  );
  return {
    students,
    offerings,
    scores,
    missing,
    assignments,
    pending: Number(pending.n),
    open: Number(open.n),
    unsubmitted,
    ready:
      students.length > 0 &&
      offerings.length > 0 &&
      !missing.length &&
      !Number(open.n) &&
      !Number(pending.n) &&
      !unsubmitted.length,
    revision: await scope(db, term, section),
  };
}
export async function reconcile(
  db: Database,
  actor: Actor,
  term: string,
  section: string,
) {
  allow(actor, "SYSTEM_ADMIN", "REGISTRAR", "APPROVER");
  const c = await coverage(db, term, section);
  const statements = [];
  for (const m of c.missing) {
    const a = c.assignments.find((a) => a.offering_id === m.offering_id);
    statements.push(
      sql(
        `INSERT INTO score_exception(id,enrollment_id,term_id,offering_id,assignment_id,kind,reason,status,created_at) SELECT ?,?,?,?,?,?,'','OPEN',? WHERE NOT EXISTS(SELECT 1 FROM score_exception WHERE enrollment_id=? AND term_id=? AND offering_id=? AND status!='RESOLVED')`,
        crypto.randomUUID(),
        m.enrollment_id,
        term,
        m.offering_id,
        a?.id || null,
        a && Number(a.submissions) ? "OMITTED_ROW" : "NO_SUBMISSION",
        new Date().toISOString(),
        m.enrollment_id,
        term,
        m.offering_id,
      ),
    );
  }
  if (statements.length) await db.batch(statements);
  return c;
}

import {
  Runtime,
  Actor,
  one,
  demand,
  allow,
  sql,
  audit,
  uid,
  now,
  hash,
  parse,
  guard,
  Statement,
} from "./contracts";
import { coverage, scopeGuard } from "./data";
import { aggregate, ranks } from "../domain/academic";
export async function calculate(
  rt: Runtime,
  actor: Actor,
  term: string,
  section: string,
) {
  allow(actor, "SYSTEM_ADMIN", "REGISTRAR");
  const c = await coverage(rt.db, term, section);
  demand(
    c.ready,
    "INCOMPLETE_SCOPE",
    `Resolve ${c.missing.length} missing marks, ${c.open} open exceptions, ${c.pending} pending submissions and ${c.unsubmitted.length} missing submissions.`,
  );
  const school = await one(rt.db, "SELECT * FROM school"),
    context = await one(
      rt.db,
      `SELECT g.label grade,s.label section,t.label term,y.label AS year FROM section s JOIN grade g ON g.id=s.grade_id JOIN term t ON t.id=? JOIN academic_year y ON y.id=t.year_id WHERE s.id=?`,
      [term, section],
    );
  const previous = await one(
      rt.db,
      "SELECT * FROM result_run WHERE term_id=? AND section_id=? ORDER BY revision DESC LIMIT 1",
      [term, section],
    ),
    id = uid(),
    at = now();
  const students = ranks(
    c.students.map((student) => {
      const marks = c.offerings.map((o) => {
        const sc = c.scores.find(
          (x) =>
            x.enrollment_id === student.enrollment_id && x.offering_id === o.id,
        )!;
        return {
          offering_id: o.id,
          subject_name: o.name,
          value: String(sc.value),
          maximum: String(o.maximum),
          weight: String(o.weight),
          source_score_id: sc.id,
        };
      });
      return {
        ...student,
        enrollment_id: student.enrollment_id,
        full_name: student.full_name,
        student_code: student.code,
        marks,
        ...aggregate(marks),
      };
    }),
  );
  const fingerprint = await hash(JSON.stringify(students));
  const policy = {
    ...parse(school.settings),
    ...context,
    school_name: school.name,
    timezone: school.timezone,
    rounding: "HALF_UP_2",
    rank: "COMPETITION",
    curriculum: c.offerings.map((o) => [
      o.id,
      String(o.maximum),
      String(o.weight),
    ]),
  };
  const s: Statement[] = [
    ...scopeGuard(term, section, c.revision),
    ...guard("EXISTS(SELECT 1 FROM school WHERE revision=?)", school.revision),
    sql(
      "INSERT INTO result_run(id,term_id,section_id,revision,scope_revision,school_revision,status,fingerprint,policy,created_by,created_at,supersedes_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      term,
      section,
      Number(previous?.revision || 0) + 1,
      c.revision,
      school.revision,
      "READY",
      fingerprint,
      JSON.stringify(policy),
      actor.id,
      at,
      previous?.id || null,
    ),
  ];
  for (const student of students) {
    const sid = uid();
    s.push(
      sql(
        "INSERT INTO student_result(id,run_id,enrollment_id,student_code,full_name,total,max_total,average,section_rank) VALUES(?,?,?,?,?,?,?,?,?)",
        sid,
        id,
        student.enrollment_id,
        student.student_code,
        student.full_name,
        student.total,
        student.max_total,
        student.average,
        student.rank,
      ),
    );
    for (const m of student.marks)
      s.push(
        sql(
          "INSERT INTO result_mark(id,student_result_id,offering_id,subject_name,value,maximum,weight,source_score_id) VALUES(?,?,?,?,?,?,?,?)",
          uid(),
          sid,
          m.offering_id,
          m.subject_name,
          m.value,
          m.maximum,
          m.weight,
          m.source_score_id,
        ),
      );
  }
  s.push(
    audit(actor, "RESULT_CALCULATED", "result_run", id, {
      count: students.length,
    }),
  );
  await rt.db.batch(s);
  return { id };
}
export async function approve(
  rt: Runtime,
  actor: Actor,
  ids: string[],
  gradeMode = false,
) {
  allow(actor, "APPROVER");
  demand(ids.length > 0, "NO_RUNS", "Select a result run.");
  const school = await one(rt.db, "SELECT * FROM school"),
    settings = parse(school.settings),
    runs: any[] = [];
  for (const id of ids) {
    const r = await one(rt.db, "SELECT * FROM result_run WHERE id=?", [id]);
    demand(
      r && r.status === "READY",
      "NOT_READY",
      "Run is not ready for approval.",
    );
    demand(
      settings.selfApproval || r.created_by !== actor.id,
      "SEPARATE_APPROVER",
      "A different authorized approver must review this run.",
    );
    const c = await coverage(rt.db, r.term_id, r.section_id);
    demand(
      c.ready &&
        c.revision === r.scope_revision &&
        school.revision === r.school_revision,
      "STALE_RESULT_RUN",
      "Inputs changed. Calculate a new result run.",
      409,
    );
    runs.push(r);
  }
  const s: Statement[] = [];
  if (gradeMode) {
    const policy = parse(runs[0].policy),
      term = runs[0].term_id;
    const sections = await rt.db.all(
      "SELECT s.id FROM section s JOIN section selected ON selected.grade_id=s.grade_id WHERE selected.id=? AND s.active=1",
      [runs[0].section_id],
    );
    demand(
      sections.length === runs.length &&
        new Set(runs.map((r) => r.section_id)).size === sections.length &&
        sections.every((sec) =>
          runs.some((r) => r.section_id === sec.id && r.term_id === term),
        ),
      "GRADE_INCOMPLETE",
      "Every active section of this grade and term must have a ready run.",
    );
    demand(
      runs.every(
        (r) =>
          JSON.stringify(parse(r.policy).curriculum) ===
          JSON.stringify(policy.curriculum),
      ),
      "CURRICULUM_MISMATCH",
      "Grade rankings require comparable curricula.",
    );
    const all = (
      await Promise.all(
        runs.map((r) =>
          rt.db.all("SELECT * FROM student_result WHERE run_id=?", [r.id]),
        ),
      )
    ).flat();
    for (const row of ranks(
      all.map((r) => ({
        ...r,
        id: r.id,
        average: Number(r.average).toFixed(2),
        student_code: r.student_code,
      })),
    ))
      s.push(
        sql(
          "UPDATE student_result SET grade_rank=? WHERE id=?",
          row.rank,
          row.id,
        ),
      );
  }
  for (const r of runs) {
    s.push(
      ...scopeGuard(r.term_id, r.section_id, r.scope_revision),
      ...guard(
        "EXISTS(SELECT 1 FROM result_run WHERE id=? AND status='READY')",
        r.id,
      ),
      ...guard(
        "EXISTS(SELECT 1 FROM school WHERE revision=?)",
        r.school_revision,
      ),
      ...guard("EXISTS(SELECT 1 FROM users WHERE id=? AND active=1)", actor.id),
      sql(
        "UPDATE result_run SET status='APPROVED',approved_by=?,approved_at=? WHERE id=?",
        actor.id,
        now(),
        r.id,
      ),
      audit(actor, "RESULT_APPROVED", "result_run", r.id, { gradeMode }),
    );
  }
  await rt.db.batch(s);
  return { approved: ids };
}

import bcrypt from "bcryptjs";
import { fields } from "../domain/academic";
import {
  Runtime,
  Actor,
  Statement,
  sql,
  now,
  one,
  guard,
  audit,
} from "./contracts";
export const sampleName = (n: number, s: string) =>
  s === "A" && n === 1
    ? "ሐና ተስፋዬ"
    : s === "A" && n === 5
      ? "Abel Tesfaye"
      : s === "A" && n === 12
        ? "Sara Bekele"
        : s === "B" && n === 28
          ? "Mekdes Alemayehu Gebremariam Tesfaye Bekele"
          : "Student " + s + " " + String(n).padStart(2, "0");
export const SUBJECTS = [
  { code: "MATH", subject: "Mathematics", username: "math" },
  { code: "ENG", subject: "English", username: "english" },
  { code: "SCI", subject: "Science", username: "science" },
];
// Teacher credentials are read from the environment rather than committed, so
// the default accounts shipped for a brand-new database are not published in
// the source (or the repository it lives in).
const teacherPassword = (code: string) => {
  const value = process.env["TEACHER_" + code + "_PASSWORD"];
  if (!value || value.length < 8)
    throw new Error(
      "Set TEACHER_" +
        code +
        "_PASSWORD (at least 8 characters) before seeding a new school.",
    );
  return value;
};
export async function setup(
  rt: Runtime,
  owner: Actor,
  name: string,
  sample = false,
  passwordHash?: string,
) {
  if (await one(rt.db, "SELECT id FROM school"))
    throw new Error("School already configured");
  const at = now(),
    s: Statement[] = [
      ...guard("NOT EXISTS(SELECT 1 FROM school)"),
      sql(
        "INSERT INTO users(id,name,email,password_hash,roles,active,created_at) VALUES(?,?,?,?,?,1,?)",
        owner.id,
        owner.name,
        owner.email,
        passwordHash || null,
        JSON.stringify(owner.roles),
        at,
      ),
      sql(
        "INSERT INTO school(id,name,settings) VALUES(?,?,?)",
        "school",
        name,
        JSON.stringify({
          selfApproval: !sample,
          gradeRankRequired: false,
        }),
      ),
      sql(
        "INSERT INTO academic_year(id,label) VALUES(?,?)",
        "year-2026",
        "2026 / 2027",
      ),
      sql(
        "INSERT INTO term(id,year_id,label) VALUES(?,?,?)",
        "term-1",
        "year-2026",
        "Semester 1",
      ),
      sql(
        "INSERT INTO grade(id,label,sort_order) VALUES(?,?,?)",
        "grade-8",
        "8",
        8,
      ),
    ];
  for (const section of ["A", "B"])
    s.push(
      sql(
        "INSERT INTO section(id,grade_id,label) VALUES(?,?,?)",
        "section-" + section,
        "grade-8",
        section,
      ),
      sql(
        "INSERT INTO scope_state(id,term_id,section_id,revision) VALUES(?,?,?,?)",
        "term-1:section-" + section,
        "term-1",
        "section-" + section,
        sample ? 1 : 0,
      ),
    );
  for (const [i, subject] of SUBJECTS.entries()) {
    s.push(
      sql(
        "INSERT INTO subject(id,name,code) VALUES(?,?,?)",
        "subject-" + subject.code,
        subject.subject,
        subject.code,
      ),
      sql(
        "INSERT INTO offering(id,grade_id,subject_id,maximum,weight,sort_order) VALUES(?,?,?,?,?,?)",
        "offering-" + subject.code,
        "grade-8",
        "subject-" + subject.code,
        "100",
        "1",
        i,
      ),
    );
    const identifier = sample
        ? subject.code.toLowerCase() + "@demo.school"
        : subject.username,
      teacherHash = sample
        ? passwordHash || null
        : await bcrypt.hash(teacherPassword(subject.code), 12);
    s.push(
      sql(
        "INSERT INTO users(id,name,email,password_hash,roles,active,created_at) VALUES(?,?,?,?,?,1,?)",
        "teacher-" + subject.code,
        subject.subject + " Teacher",
        identifier,
        teacherHash,
        '["TEACHER"]',
        at,
      ),
    );
    for (const section of ["A", "B"])
      s.push(
        sql(
          "INSERT INTO assignment(id,teacher_id,term_id,section_id,offering_id) VALUES(?,?,?,?,?)",
          "assignment-" + section + "-" + subject.code,
          "teacher-" + subject.code,
          "term-1",
          "section-" + section,
          "offering-" + subject.code,
        ),
      );
  }
  s.push(
    sql(
      "INSERT INTO report_template(id,family_id,name,version,file_type,page_width,page_height,fields,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      "template-sample",
      "template-sample",
      "ClassLedger sample",
      1,
      "SAMPLE",
      595.28,
      841.89,
      JSON.stringify(fields),
      "APPROVED",
      owner.id,
      at,
    ),
  );
  if (sample) {
    for (const [id, role, name] of [
      ["registrar", "REGISTRAR", "Sample Registrar"],
      ["principal", "APPROVER", "Sample Principal"],
    ])
      s.push(
        sql(
          "INSERT INTO users(id,name,email,password_hash,roles,created_at) VALUES(?,?,?,?,?,?)",
          id,
          name,
          id + "@demo.school",
          passwordHash || null,
          JSON.stringify([role]),
          at,
        ),
      );
    for (const section of ["A", "B"])
      for (let n = 1; n <= (section === "A" ? 20 : 30); n++) {
        const code = String((section === "A" ? 1000 : 2000) + n);
        s.push(
          sql(
            "INSERT INTO student(id,code,full_name) VALUES(?,?,?)",
            "student-" + code,
            code,
            sampleName(n, section),
          ),
          sql(
            "INSERT INTO enrollment(id,student_id,year_id,section_id) VALUES(?,?,?,?)",
            "enrollment-" + code,
            "student-" + code,
            "year-2026",
            "section-" + section,
          ),
        );
      }
    for (const section of ["A", "B"])
      for (const [index, subject] of ["MATH", "ENG", "SCI"].entries()) {
        const aid = "assignment-" + section + "-" + subject,
          bid = "seed-" + aid;
        s.push(
          sql(
            "INSERT INTO import_batch(id,assignment_id,actor_id,source_key,file_hash,filename,status,payload,scope_revision,created_at,committed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            bid,
            aid,
            "teacher-" + subject,
            "seed/" + aid + ".csv",
            bid,
            "Sample " + section + " " + subject + ".csv",
            "COMMITTED",
            "{}",
            0,
            at,
            at,
          ),
        );
        for (let n = 1; n <= (section === "A" ? 20 : 30); n++) {
          const code = String((section === "A" ? 1000 : 2000) + n),
            missing =
              section === "A" && subject === "MATH" && [5, 12].includes(n),
            value =
              section === "B" && subject === "MATH" && n === 15
                ? "0"
                : String(65 + ((n * 7 + index * 11) % 35)),
            rid = bid + "-" + n;
          s.push(
            sql(
              "INSERT INTO import_row(id,batch_id,line_number,enrollment_id,raw_cells,value,reason,errors,warnings) VALUES(?,?,?,?,?,?,?,?,?)",
              rid,
              bid,
              n + 1,
              "enrollment-" + code,
              JSON.stringify({ code, score: missing ? "-" : value }),
              missing ? null : value,
              missing ? (n === 5 ? "REPORTED_MISCONDUCT" : "ABSENT") : "",
              "[]",
              "[]",
            ),
          );
          if (missing)
            s.push(
              sql(
                "INSERT INTO score_exception(id,enrollment_id,term_id,offering_id,assignment_id,source_row_id,kind,reason,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                "exception-" + code,
                "enrollment-" + code,
                "term-1",
                "offering-" + subject,
                aid,
                rid,
                "MISSING_VALUE",
                n === 5 ? "REPORTED_MISCONDUCT" : "ABSENT",
                "OPEN",
                at,
              ),
            );
          else
            s.push(
              sql(
                "INSERT INTO score(id,enrollment_id,term_id,offering_id,value,source_row_id,actor_id,revision,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                "score-" + code + "-" + subject,
                "enrollment-" + code,
                "term-1",
                "offering-" + subject,
                value,
                rid,
                "teacher-" + subject,
                1,
                at,
              ),
            );
        }
      }
  }
  s.push(audit(owner, "SCHOOL_CREATED", "school", "school", { sample }));
  await rt.db.batch(s);
}

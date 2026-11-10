import bcrypt from "bcryptjs";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import {
  Runtime,
  Actor,
  AppError,
  one,
  demand,
  allow,
  staff,
  sql,
  uid,
  now,
  hash,
  parse,
  guard,
  audit,
  Statement,
} from "./contracts";
import {
  assignment,
  coverage,
  reconcile,
  roster,
  scope,
  scopeGuard,
  bump,
} from "./data";
import { stage, commit } from "./imports";
import { parseFile, autoMap, workbook } from "./import-files";
import { calculate, approve } from "./results";
import {
  fields,
  fieldErrors,
  Field,
  scoreValue,
  csv,
} from "../domain/academic";
import { runJob, render } from "./pdf";
const str = z.string().trim().min(1).max(200),
  id = z.string().min(1).max(100),
  reason = z.string().trim().min(8).max(1000);
const respond = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    throw new AppError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
  return schema.parse(payload);
}
async function fileInput(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError(
      "INVALID_FORM",
      "Upload must be sent as multipart form data.",
      400,
    );
  }
  const file = form.get("file");
  demand(file instanceof File, "FILE_REQUIRED", "Choose a file.");
  demand(
    file.size <= 5 * 1024 * 1024,
    "FILE_TOO_LARGE",
    "Maximum upload is 5 MB.",
  );
  return { form, file, bytes: new Uint8Array(await file.arrayBuffer()) };
}
async function download(
  rt: Runtime,
  actor: Actor,
  key: string,
  name: string,
  type: string,
  inline = false,
) {
  const bytes = await rt.storage.get(key);
  demand(bytes, "FILE_NOT_FOUND", "File not found.", 404);
  await rt.db.batch([audit(actor, "FILE_DOWNLOADED", "file", key)]);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": type,
      "Content-Disposition":
        (inline ? "inline" : "attachment") +
        '; filename="' +
        name.replace(/[^\w.-]/g, "_") +
        '"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function getActor(rt: Runtime, req: Request): Promise<Actor | null> {
  let user;
  if (rt.identity) {
    user = await one(rt.db, "SELECT * FROM users WHERE id=?", [rt.identity.id]);
  } else if (rt.localAuth) {
    const token = req.headers
      .get("cookie")
      ?.match(/(?:^|; )classledger_session=([^;]+)/)?.[1];
    if (token)
      user = await one(
        rt.db,
        "SELECT u.* FROM users u JOIN session s ON s.user_id=u.id WHERE s.id=? AND s.expires_at>?",
        [await hash(token), now()],
      );
  }
  return user?.active === 1
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: parse(user.roles),
      }
    : null;
}
// Escapes the wildcards users could otherwise inject into a LIKE pattern, so a
// search for "%" matches a literal percent sign instead of every row.
const like = (s: string) => "%" + s.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
const safeHost = (value?: string) => {
  try {
    return new URL(value || "").host;
  } catch {
    return "";
  }
};
// Behind a proxy or serverless platform the socket address is not the caller's,
// so trust the forwarding headers the platform sets.
const clientIp = (req: Request) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";
const isSecure = (req: Request, url: URL) =>
  url.protocol === "https:" ||
  req.headers.get("x-forwarded-proto") === "https" ||
  process.env.VERCEL === "1" ||
  process.env.COOKIE_SECURE === "1";
async function limit(rt: Runtime, key: string, max: number) {
  const window = Math.floor(Date.now() / 60000),
    rid = key + ":" + window,
    statements = [
      sql(
        "INSERT INTO rate_limit(id,count) VALUES(?,1) ON CONFLICT(id) DO UPDATE SET count=rate_limit.count+1",
        rid,
      ),
    ];
  // A counter is keyed by the minute it belongs to and is never read again once
  // that minute passes, so drop the ones that can no longer apply rather than
  // letting the table grow for the life of the deployment.
  if (window % 20 === 0)
    statements.push(
      sql(
        "DELETE FROM rate_limit WHERE split_part(id,':',-1) ~ '^[0-9]+$' AND split_part(id,':',-1)::int < ?",
        window - 1,
      ),
    );
  await rt.db.batch(statements);
  const r = await one(rt.db, "SELECT count FROM rate_limit WHERE id=?", [rid]);
  demand(
    r.count <= max,
    "RATE_LIMIT",
    "Too many requests. Please try again in one minute.",
    429,
  );
}
export async function handle(rt: Runtime, req: Request): Promise<Response> {
  try {
    const url = new URL(req.url),
      parts = url.pathname.replace(/^\/api\/?/, "").split("/"),
      [route, key, action] = parts,
      method = req.method,
      write = !["GET", "HEAD"].includes(method);
    if (write) {
      // Compare hosts only: the browser forwards whatever scheme/port the user
      // reached us on, which may differ from the canonical URL behind a proxy.
      const originHost = safeHost(req.headers.get("origin") || undefined),
        allowedHosts = [process.env.APP_URL, url.origin]
          .map(safeHost)
          .filter(Boolean);
      demand(
        !originHost || allowedHosts.includes(originHost),
        "CSRF_REJECTED",
        "Request origin does not match.",
        403,
      );
      demand(
        Number(req.headers.get("content-length") || 0) < 6 * 1024 * 1024,
        "REQUEST_TOO_LARGE",
        "Request too large.",
        413,
      );
    }
    if (route === "health") {
      await rt.db.all("SELECT 1");
      return respond({ status: "ok", service: "ClassLedger" });
    }
    if (route === "auth" && key === "login" && method === "POST") {
      const input = await body(
        req,
        z.object({
          username: z.string().trim().min(3).max(100),
          password: z.string().min(1).max(128),
          portal: z.enum(["admin", "teacher"]).default("teacher"),
        }),
      );
      // Limit both the source address (so one client cannot spray many
      // usernames) and the account (so distributed guessing on a single
      // username is still bounded).
      await limit(rt, "login-ip:" + clientIp(req), 30);
      await limit(rt, "login:" + (await hash(input.username.toLowerCase())), 10);
      const u = await one(rt.db, "SELECT * FROM users WHERE LOWER(email)=?", [
        input.username.toLowerCase(),
      ]);
      const okay = u?.password_hash
        ? await bcrypt.compare(input.password, u.password_hash)
        : await bcrypt.compare(
            input.password,
            "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          );
      demand(
        u?.active === 1 && okay,
        "INVALID_LOGIN",
        "Username or password is incorrect.",
        401,
      );
      const roles: string[] = parse(u.roles),
        isStaff = roles.some((r) =>
          ["SYSTEM_ADMIN", "REGISTRAR", "APPROVER"].includes(r),
        );
      demand(
        input.portal === "teacher" ? roles.includes("TEACHER") : isStaff,
        "WRONG_PORTAL",
        input.portal === "teacher"
          ? "This is an administrator account. Use the administrator section."
          : "This is a teacher account. Use the teacher section.",
        403,
      );
      const token = uid() + uid();
      await rt.db.batch([
        // Reap sessions that can no longer authenticate anyone so the table
        // does not accumulate rows for the life of the deployment.
        sql("DELETE FROM session WHERE expires_at < ?", now()),
        sql(
          "INSERT INTO session(id,user_id,expires_at) VALUES(?,?,?)",
          await hash(token),
          u.id,
          new Date(Date.now() + 8 * 3600000).toISOString(),
        ),
      ]);
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie": `classledger_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${isSecure(req, url) ? "; Secure" : ""}`,
        },
      });
    }
    if (route === "auth" && key === "logout" && method === "POST") {
      const token = req.headers
        .get("cookie")
        ?.match(/(?:^|; )classledger_session=([^;]+)/)?.[1];
      if (token)
        await rt.db.batch([
          sql("DELETE FROM session WHERE id=?", await hash(token)),
        ]);
      return new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie":
            "classledger_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
        },
      });
    }
    const school = await one(rt.db, "SELECT * FROM school");
    const actor = await getActor(rt, req);
    if (route === "bootstrap") {
      return respond({
        school: school ? { ...school, settings: parse(school.settings) } : null,
        actor,
        localAuth: !!rt.localAuth,
      });
    }
    demand(actor, "AUTH_REQUIRED", "Please sign in.", 401);
    if (write) await limit(rt, "write:" + actor.id, 90);
    const term =
        url.searchParams.get("term") ||
        (await one(rt.db, "SELECT id FROM term ORDER BY id LIMIT 1"))?.id,
      section = url.searchParams.get("section") || "";
    if (route === "lookups") {
      const teachers = actor.roles.some((r) =>
        ["SYSTEM_ADMIN", "REGISTRAR"].includes(r),
      )
        ? await rt.db.all("SELECT id,name,roles FROM users WHERE active=1")
        : [];
      return respond({
        years: await rt.db.all("SELECT * FROM academic_year"),
        terms: await rt.db.all("SELECT * FROM term"),
        grades: await rt.db.all("SELECT * FROM grade ORDER BY sort_order"),
        sections: await rt.db.all(
          "SELECT s.*,g.label grade FROM section s JOIN grade g ON g.id=s.grade_id ORDER BY g.sort_order,s.label",
        ),
        subjects: await rt.db.all("SELECT * FROM subject"),
        offerings: await rt.db.all(
          "SELECT o.*,s.name,g.label grade FROM offering o JOIN subject s ON s.id=o.subject_id JOIN grade g ON g.id=o.grade_id ORDER BY o.sort_order",
        ),
        teachers: teachers.map((t) => ({ ...t, roles: parse(t.roles) })),
      });
    }
    if (route === "overview") {
      staff(actor);
      const sections = await rt.db.all(
        "SELECT s.*,g.label grade FROM section s JOIN grade g ON g.id=s.grade_id WHERE s.active=1 ORDER BY g.sort_order,s.label",
      );
      const states = await Promise.all(
        sections.map(async (s) => ({
          ...s,
          ...(await coverage(rt.db, term, s.id)),
        })),
      );
      return respond({
        students: states.reduce((n, s) => n + s.students.length, 0),
        expected: states.reduce((n, s) => n + s.offerings.length, 0),
        submitted: states.reduce(
          (n, s) =>
            n +
            s.assignments.filter((a: any) => Number(a.submissions) > 0).length,
          0,
        ),
        missing: states.reduce((n, s) => n + s.missing.length, 0),
        ready: states.filter((s) => s.ready).length,
        states: states.map(({ students, scores, missing, ...s }) => ({
          ...s,
          studentCount: students.length,
          missingCount: missing.length,
        })),
        recent: await rt.db.all(
          `SELECT b.id,b.filename,b.status,b.created_at,u.name teacher,sub.name subject,s.label section,g.label grade FROM import_batch b JOIN assignment a ON a.id=b.assignment_id JOIN users u ON u.id=b.actor_id JOIN offering o ON o.id=a.offering_id JOIN subject sub ON sub.id=o.subject_id JOIN section s ON s.id=a.section_id JOIN grade g ON g.id=s.grade_id WHERE a.term_id=? ORDER BY b.created_at DESC LIMIT 5`,
          [term],
        ),
      });
    }
    if (route === "students") {
      staff(actor);
      if (method === "GET") {
        const page = Math.max(1, Number(url.searchParams.get("page") || 1)),
          q = like(url.searchParams.get("q") || ""),
          params = [term, q, q, ...(section ? [section] : [])],
          where = `t.id=? AND (LOWER(s.full_name) LIKE LOWER(?) OR s.code LIKE ?) ${section ? "AND e.section_id=?" : ""}`,
          base =
            "FROM student s JOIN enrollment e ON e.student_id=s.id JOIN term t ON t.year_id=e.year_id JOIN section sec ON sec.id=e.section_id JOIN grade g ON g.id=sec.grade_id";
        const total = await one(
          rt.db,
          "SELECT COUNT(*) n " + base + " WHERE " + where,
          params,
        );
        return respond({
          items: await rt.db.all(
            "SELECT s.*,e.id enrollment_id,e.section_id,g.label grade,sec.label section " +
              base +
              " WHERE " +
              where +
              " ORDER BY s.code LIMIT 25 OFFSET ?",
            [...params, (page - 1) * 25],
          ),
          total: Number(total.n),
          page,
        });
      }
      allow(actor, "SYSTEM_ADMIN", "REGISTRAR");
      const input = await body(
        req,
        z.object({
          code: str,
          full_name: str,
          section_id: id,
          year_id: id,
          active: z.boolean().default(true),
          reason: z.string().default(""),
        }),
      );
      if (key) {
        demand(
          (input.reason || "").trim().length >= 8,
          "REASON_REQUIRED",
          "Explain the roster correction.",
        );
        const existing = await one(rt.db, "SELECT * FROM student WHERE id=?", [
          key,
        ]);
        demand(existing, "NOT_FOUND", "Student not found.", 404);
        const e = await one(
          rt.db,
          "SELECT * FROM enrollment WHERE student_id=? AND year_id=?",
          [key, input.year_id],
        );
        demand(e, "NOT_FOUND", "Enrollment not found.", 404);
        await rt.db.batch([
          sql(
            "UPDATE student SET code=?,full_name=?,active=? WHERE id=?",
            input.code,
            input.full_name,
            input.active ? 1 : 0,
            key,
          ),
          sql(
            "UPDATE enrollment SET section_id=?,active=? WHERE id=?",
            input.section_id,
            input.active ? 1 : 0,
            e.id,
          ),
          sql(
            "UPDATE scope_state SET revision=revision+1 WHERE term_id IN(SELECT id FROM term WHERE year_id=?)",
            input.year_id,
          ),
          audit(actor, "ROSTER_CORRECTED", "student", key, {
            reason: input.reason,
          }),
        ]);
        return respond({ id: key });
      }
      const sid = uid();
      await rt.db.batch([
        sql(
          "INSERT INTO student(id,code,full_name,active) VALUES(?,?,?,?)",
          sid,
          input.code,
          input.full_name,
          input.active ? 1 : 0,
        ),
        sql(
          "INSERT INTO enrollment(id,student_id,year_id,section_id) VALUES(?,?,?,?)",
          uid(),
          sid,
          input.year_id,
          input.section_id,
        ),
        sql(
          "UPDATE scope_state SET revision=revision+1 WHERE section_id=? AND term_id IN(SELECT id FROM term WHERE year_id=?)",
          input.section_id,
          input.year_id,
        ),
        audit(actor, "STUDENT_CREATED", "student", sid),
      ]);
      return respond({ id: sid });
    }
    if (route === "roster-import") {
      allow(actor, "SYSTEM_ADMIN", "REGISTRAR");
      if (method === "POST" && !key) {
        const { form, file, bytes } = await fileInput(req),
          sectionId = String(form.get("section") || ""),
          year = String(form.get("year") || "");
        demand(
          await one(rt.db, "SELECT id FROM section WHERE id=?", [sectionId]),
          "INVALID_SECTION",
          "Choose a section.",
        );
        demand(
          await one(rt.db, "SELECT id FROM academic_year WHERE id=?", [year]),
          "INVALID_YEAR",
          "Choose an academic year.",
        );
        const table = await parseFile(bytes, file.name),
          map = autoMap(table.headers);
        demand(
          map.code >= 0 && map.name >= 0,
          "MAPPING_REQUIRED",
          "Roster needs Student ID and Full Name columns.",
        );
        const seen = new Set(),
          rows = [];
        for (const [i, r] of table.rows.entries()) {
          const code = r[map.code]?.trim(),
            name = r[map.name]?.trim(),
            errors = [];
          if (!code || !name) errors.push("Missing Student ID or name");
          if (seen.has(code)) errors.push("Duplicate Student ID");
          seen.add(code);
          if (
            await one(rt.db, "SELECT id FROM student WHERE code=?", [
              code || "",
            ])
          )
            errors.push(
              "Student ID already exists; edit the existing student instead.",
            );
          rows.push({ line: i + 2, code, name, errors });
        }
        const bid = uid(),
          source = "imports/" + bid + "/roster";
        await rt.storage.put(source, bytes);
        await rt.db.batch([
          sql(
            "INSERT INTO import_batch(id,kind,actor_id,source_key,file_hash,filename,status,payload,scope_revision,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            bid,
            "ROSTER",
            actor.id,
            source,
            await hash(bytes),
            file.name,
            rows.some((r) => r.errors.length) ? "INVALID" : "STAGED",
            JSON.stringify({ rows, section: sectionId, year }),
            school.revision,
            now(),
          ),
        ]);
        return respond({ id: bid, rows });
      }
      if (key && action === "commit") {
        const b = await one(
          rt.db,
          "SELECT * FROM import_batch WHERE id=? AND kind='ROSTER'",
          [key],
        );
        demand(
          b?.status === "STAGED",
          "INVALID_BATCH",
          "Only a validated staged roster may be committed.",
        );
        const p = parse(b.payload),
          s: Statement[] = [
            ...guard(
              "EXISTS(SELECT 1 FROM import_batch WHERE id=? AND status='STAGED')",
              key,
            ),
          ];
        for (const row of p.rows) {
          const student = uid();
          s.push(
            sql(
              "INSERT INTO student(id,code,full_name) VALUES(?,?,?)",
              student,
              row.code,
              row.name,
            ),
            sql(
              "INSERT INTO enrollment(id,student_id,year_id,section_id) VALUES(?,?,?,?)",
              uid(),
              student,
              p.year,
              p.section,
            ),
          );
        }
        s.push(
          sql(
            "UPDATE import_batch SET status='COMMITTED',committed_at=? WHERE id=?",
            now(),
            key,
          ),
          sql(
            "UPDATE scope_state SET revision=revision+1 WHERE section_id=? AND term_id IN(SELECT id FROM term WHERE year_id=?)",
            p.section,
            p.year,
          ),
          audit(actor, "ROSTER_IMPORTED", "import_batch", key, {
            count: p.rows.length,
          }),
        );
        await rt.db.batch(s);
        return respond({ ok: true });
      }
    }
    if (route === "assignments") {
      if (method === "GET" && !key) {
        const teachingOnly = !actor.roles.some((r) =>
          ["SYSTEM_ADMIN", "REGISTRAR", "APPROVER"].includes(r),
        );
        return respond(
          await rt.db.all(
            `SELECT a.*,u.name teacher,sub.name subject,o.maximum,g.label grade,s.label section,(SELECT COUNT(*) FROM import_batch b WHERE b.assignment_id=a.id AND b.status='COMMITTED') submissions FROM assignment a JOIN users u ON u.id=a.teacher_id JOIN offering o ON o.id=a.offering_id JOIN subject sub ON sub.id=o.subject_id JOIN section s ON s.id=a.section_id JOIN grade g ON g.id=s.grade_id WHERE a.term_id=? ${teachingOnly ? "AND a.teacher_id=?" : ""} ORDER BY g.sort_order,s.label,sub.name`,
            teachingOnly ? [term, actor.id] : [term],
          ),
        );
      }
      if (key && action === "template") {
        const a = await assignment(rt.db, actor, key),
          students = await roster(rt.db, a.term_id, a.section_id);
        return new Response(
          (await workbook([
            [
              "Student ID",
              "Full Name",
              "Grade",
              "Section",
              "Score",
              "Reason",
              "Remark",
            ],
            ...students.map((s) => [
              s.code,
              s.full_name,
              a.grade,
              a.section,
              "",
              "",
              "",
            ]),
          ])) as BodyInit,
          {
            headers: {
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition":
                'attachment; filename="Marks_Template.xlsx"',
            },
          },
        );
      }
      if (method === "POST") {
        allow(actor, "SYSTEM_ADMIN", "REGISTRAR");
        const p = await body(
          req,
          z.object({
            teacher_id: id,
            term_id: id,
            section_id: id,
            offering_id: id,
          }),
        );
        const teacher = await one(
          rt.db,
          "SELECT roles,active FROM users WHERE id=?",
          [p.teacher_id],
        );
        demand(
          teacher?.active === 1 &&
            parse<string[]>(teacher.roles).includes("TEACHER"),
          "INVALID_TEACHER",
          "Choose an active teacher.",
        );
        const newId = uid();
        await rt.db.batch([
          sql(
            "INSERT INTO assignment(id,teacher_id,term_id,section_id,offering_id) VALUES(?,?,?,?,?)",
            newId,
            p.teacher_id,
            p.term_id,
            p.section_id,
            p.offering_id,
          ),
          bump(p.term_id, p.section_id),
          audit(actor, "ASSIGNMENT_CREATED", "assignment", newId),
        ]);
        return respond({ id: newId });
      }
    }
    if (route === "imports") {
      if (method === "GET" && !key) {
        const teacherOnly = !actor.roles.some((r) =>
          ["SYSTEM_ADMIN", "REGISTRAR", "APPROVER"].includes(r),
        );
        return respond(
          await rt.db.all(
            `SELECT b.*,sub.name subject,s.label section,g.label grade,u.name teacher FROM import_batch b JOIN assignment a ON a.id=b.assignment_id JOIN offering o ON o.id=a.offering_id JOIN subject sub ON sub.id=o.subject_id JOIN section s ON s.id=a.section_id JOIN grade g ON g.id=s.grade_id JOIN users u ON u.id=b.actor_id WHERE a.term_id=? ${teacherOnly ? "AND a.teacher_id=?" : ""} ORDER BY b.created_at DESC LIMIT 200`,
            teacherOnly ? [term, actor.id] : [term],
          ),
        );
      }
      if (method === "POST" && (key === "inspect" || key === "stage")) {
        const { form, file, bytes } = await fileInput(req);
        allow(actor, "SYSTEM_ADMIN", "TEACHER");
        await assignment(rt.db, actor, String(form.get("assignment")));
        if (key === "inspect") {
          const table = await parseFile(bytes, file.name);
          return respond({
            headers: table.headers,
            mapping: autoMap(table.headers),
            sample: table.rows.slice(0, 5),
            count: table.rows.length,
          });
        }
        return respond(
          await stage(rt, actor, {
            assignmentId: String(form.get("assignment")),
            filename: file.name,
            bytes,
            mapping: form.get("mapping")
              ? JSON.parse(String(form.get("mapping")))
              : undefined,
            reason: String(form.get("reason") || ""),
          }),
        );
      }
      const b = await one(rt.db, "SELECT * FROM import_batch WHERE id=?", [
        key,
      ]);
      demand(b, "NOT_FOUND", "Submission not found.", 404);
      await assignment(rt.db, actor, b.assignment_id);
      if (action === "commit" && method === "POST")
        return respond(await commit(rt, actor, key));
      const rows = await rt.db.all(
        "SELECT * FROM import_row WHERE batch_id=? ORDER BY line_number",
        [key],
      );
      if (action === "errors") {
        return new Response(
          csv([
            ["Row", "Student ID", "Errors", "Warnings"],
            ...rows.map((r) => [
              r.line_number,
              parse(r.raw_cells).code,
              parse(r.errors).join("; "),
              parse(r.warnings).join("; "),
            ]),
          ]),
          {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition":
                'attachment; filename="Validation_errors.csv"',
            },
          },
        );
      }
      return respond({
        ...b,
        payload: parse(b.payload),
        rows: rows.map((r) => ({
          ...r,
          ...parse(r.raw_cells),
          errors: parse(r.errors),
          warnings: parse(r.warnings),
        })),
      });
    }
    if (route === "exceptions") {
      staff(actor);
      const base = `SELECT x.*,st.code,st.full_name,e.section_id,s.label section,g.label grade,sub.name subject,o.maximum,u.name teacher,b.filename FROM score_exception x JOIN enrollment e ON e.id=x.enrollment_id JOIN student st ON st.id=e.student_id JOIN section s ON s.id=e.section_id JOIN grade g ON g.id=s.grade_id JOIN offering o ON o.id=x.offering_id JOIN subject sub ON sub.id=o.subject_id LEFT JOIN assignment a ON a.id=x.assignment_id LEFT JOIN users u ON u.id=a.teacher_id LEFT JOIN import_row ir ON ir.id=x.source_row_id LEFT JOIN import_batch b ON b.id=ir.batch_id`;
      if (!key) {
        for (const sec of await rt.db.all(
          "SELECT id FROM section WHERE active=1",
        ))
          await reconcile(rt.db, actor, term, sec.id);
        const status = url.searchParams.get("status") || "OPEN",
          q = like(url.searchParams.get("q") || ""),
          r = url.searchParams.get("reason") || "";
        return respond(
          await rt.db.all(
            base +
              ` WHERE x.term_id=? ${section ? "AND e.section_id=?" : ""} ${status === "ALL" ? "" : status === "RESOLVED" ? "AND x.status='RESOLVED'" : "AND x.status!='RESOLVED'"} ${r ? "AND x.reason=?" : ""} AND (LOWER(st.full_name) LIKE LOWER(?) OR st.code LIKE ?) ORDER BY x.created_at DESC LIMIT 500`,
            [term, ...(section ? [section] : []), ...(r ? [r] : []), q, q],
          ),
        );
      }
      const x = await one(rt.db, base + " WHERE x.id=?", [key]);
      demand(x, "NOT_FOUND", "Exception not found.", 404);
      if (method === "GET")
        return respond({
          ...x,
          timeline: await rt.db.all(
            "SELECT r.*,u.name actor FROM exception_resolution r JOIN users u ON u.id=r.actor_id WHERE r.exception_id=? ORDER BY r.created_at",
            [key],
          ),
        });
      const p = await body(
        req,
        z.object({
          action: z.enum(["REQUEST_CORRECTION", "UNDER_REVIEW", "RESOLVE"]),
          justification: reason,
          value: z.string().optional(),
          revision: z.number().int(),
        }),
      );
      demand(
        x.status !== "RESOLVED",
        "ALREADY_RESOLVED",
        "This exception was already resolved.",
        409,
      );
      const rev = await scope(rt.db, x.term_id, x.section_id),
        s: Statement[] = [
          ...guard(
            "EXISTS(SELECT 1 FROM score_exception WHERE id=? AND revision=? AND status!='RESOLVED')",
            key,
            p.revision,
          ),
          ...scopeGuard(x.term_id, x.section_id, rev),
        ];
      let value = null;
      if (p.action === "RESOLVE") {
        allow(actor, "SYSTEM_ADMIN", "APPROVER");
        try {
          value = scoreValue(p.value, x.maximum);
        } catch {
          throw new AppError(
            "INVALID_SCORE",
            "Enter a valid authorized score.",
          );
        }
        demand(
          value !== null,
          "NUMERIC_DECISION_REQUIRED",
          "Record an authorized numeric result. A missing mark is never automatically zero.",
        );
        s.push(
          sql(
            "UPDATE score SET effective=0 WHERE enrollment_id=? AND term_id=? AND offering_id=? AND effective=1",
            x.enrollment_id,
            x.term_id,
            x.offering_id,
          ),
          sql(
            "INSERT INTO score(id,enrollment_id,term_id,offering_id,value,source_row_id,actor_id,revision,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            uid(),
            x.enrollment_id,
            x.term_id,
            x.offering_id,
            value,
            x.source_row_id,
            actor.id,
            rev + 1,
            now(),
          ),
        );
      }
      s.push(
        sql(
          "UPDATE score_exception SET status=?,resolved_at=?,revision=revision+1 WHERE id=?",
          p.action === "RESOLVE"
            ? "RESOLVED"
            : p.action === "REQUEST_CORRECTION"
              ? "CORRECTION_REQUESTED"
              : "UNDER_REVIEW",
          p.action === "RESOLVE" ? now() : null,
          key,
        ),
        sql(
          "INSERT INTO exception_resolution(id,exception_id,action,value,justification,actor_id,created_at) VALUES(?,?,?,?,?,?,?)",
          uid(),
          key,
          p.action,
          value,
          p.justification,
          actor.id,
          now(),
        ),
        bump(x.term_id, x.section_id),
        audit(actor, "EXCEPTION_" + p.action, "score_exception", key, {
          value,
        }),
      );
      await rt.db.batch(s);
      return respond({ ok: true });
    }
    if (route === "results") {
      staff(actor);
      if (key === "readiness")
        return respond(await coverage(rt.db, term, section));
      if (key === "calculate" && method === "POST") {
        const p = await body(req, z.object({ term: id, section: id }));
        return respond(await calculate(rt, actor, p.term, p.section));
      }
      if (key === "approve-grade" && method === "POST") {
        const p = await body(
          req,
          z.object({ runIds: z.array(id).min(1).max(30) }),
        );
        return respond(await approve(rt, actor, p.runIds, true));
      }
      if (key && action === "approve" && method === "POST")
        return respond(await approve(rt, actor, [key]));
      if (key) {
        const run = await one(
          rt.db,
          "SELECT r.*,u.name creator,ap.name approver FROM result_run r JOIN users u ON u.id=r.created_by LEFT JOIN users ap ON ap.id=r.approved_by WHERE r.id=?",
          [key],
        );
        demand(run, "NOT_FOUND", "Result run not found.", 404);
        return respond({
          ...run,
          policy: parse(run.policy),
          students: await rt.db.all(
            "SELECT * FROM student_result WHERE run_id=? ORDER BY section_rank,student_code",
            [key],
          ),
        });
      }
      return respond(
        await rt.db.all(
          "SELECT r.*,s.label section,g.label grade,(SELECT COUNT(*) FROM student_result sr WHERE sr.run_id=r.id) students FROM result_run r JOIN section s ON s.id=r.section_id JOIN grade g ON g.id=s.grade_id WHERE r.term_id=? ORDER BY r.created_at DESC",
          [term],
        ),
      );
    }
    if (route === "templates") {
      staff(actor);
      if (!key && method === "GET")
        return respond(
          await rt.db.all(
            "SELECT * FROM report_template ORDER BY created_at DESC",
          ),
        );
      if (!key && method === "POST") {
        allow(actor, "SYSTEM_ADMIN", "REGISTRAR");
        const { file, form, bytes } = await fileInput(req);
        demand(
          file.name.toLowerCase().endsWith(".pdf") &&
            new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-",
          "INVALID_FILE",
          "Upload a PDF file.",
        );
        const doc = await PDFDocument.load(bytes);
        demand(
          doc.getPageCount() === 1,
          "ONE_PAGE_TEMPLATE",
          "Use a one-page report-card background.",
        );
        const size = doc.getPage(0).getSize(),
          width = size.width,
          height = size.height,
          type = "PDF";
        const tid = uid(),
          storage = "templates/" + tid + "/background";
        await rt.storage.put(storage, bytes);
        await rt.db.batch([
          sql(
            "INSERT INTO report_template(id,family_id,name,version,file_key,file_type,page_width,page_height,fields,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            tid,
            tid,
            String(form.get("name") || file.name).slice(0, 200),
            1,
            storage,
            type,
            width,
            height,
            JSON.stringify(fields),
            "DRAFT",
            actor.id,
            now(),
          ),
          audit(actor, "TEMPLATE_UPLOADED", "report_template", tid),
        ]);
        return respond({ id: tid });
      }
      const t = await one(rt.db, "SELECT * FROM report_template WHERE id=?", [
        key,
      ]);
      demand(t, "NOT_FOUND", "Template not found.", 404);
      if (action === "background") {
        const bytes = await rt.storage.get(t.file_key);
        demand(bytes, "FILE_NOT_FOUND", "Background not found.", 404);
        return new Response(bytes as BodyInit, {
          headers: {
            "Content-Type":
              t.file_type === "PDF"
                ? "application/pdf"
                : t.file_type === "PNG"
                  ? "image/png"
                  : "image/jpeg",
            "Content-Disposition": "inline",
            "Cache-Control": "private, no-store",
          },
        });
      }
      if (action === "preview") {
        const run = await one(
          rt.db,
          "SELECT r.*,u.name approver FROM result_run r LEFT JOIN users u ON u.id=r.approved_by WHERE r.status IN('READY','APPROVED') ORDER BY r.created_at DESC LIMIT 1",
        );
        demand(
          run,
          "NO_RESULT_RUN",
          "Calculate a result run to preview representative students.",
        );
        const students = await rt.db.all(
          "SELECT * FROM student_result WHERE run_id=? ORDER BY length(full_name) DESC LIMIT 3",
          [run.id],
        );
        run.approved_at ||= now();
        return new Response((await render(rt, t, run, students)) as BodyInit, {
          headers: {
            "Content-Type": "application/pdf",
            "Cache-Control": "no-store",
          },
        });
      }
      if (method === "GET") return respond({ ...t, fields: parse(t.fields) });
      allow(actor, "SYSTEM_ADMIN", "REGISTRAR");
      if (action === "approve") {
        if (t.status === "APPROVED") return respond({ id: key });
        const max = await one(
          rt.db,
          "SELECT MAX(n) n FROM(SELECT COUNT(*) n FROM offering WHERE required=1 GROUP BY grade_id) counts",
        );
        const errors = fieldErrors(
          parse(t.fields),
          Number(t.page_width),
          Number(t.page_height),
          Number(max?.n || 3),
        );
        demand(!errors.length, "TEMPLATE_MAPPING_INCOMPLETE", errors.join(" "));
        await rt.db.batch([
          sql("UPDATE report_template SET status='APPROVED' WHERE id=?", key),
          audit(actor, "TEMPLATE_APPROVED", "report_template", key),
        ]);
        return respond({ id: key });
      }
      const field = z.object({
        key: str,
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().positive(),
        height: z.number().positive(),
        fontSize: z.number().min(8).max(72),
        align: z.enum(["left", "center", "right"]),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        overflow: z.enum(["wrap", "shrink", "error"]),
        fontFamily: z.enum(["sans", "serif"]),
      });
      const p = await body(
        req,
        z.object({
          fields: z.array(field).max(40),
          page_width: z.number().min(200).max(1200),
          page_height: z.number().min(200).max(1800),
        }),
      );
      if (t.file_type === "PDF")
        demand(
          p.page_width === Number(t.page_width) &&
            p.page_height === Number(t.page_height),
          "PDF_PAGE_SIZE_LOCKED",
          "PDF page dimensions follow the original file.",
        );
      if (t.status === "APPROVED") {
        const version = await one(
            rt.db,
            "SELECT MAX(version) n FROM report_template WHERE family_id=?",
            [t.family_id],
          ),
          tid = uid();
        await rt.db.batch([
          sql(
            "INSERT INTO report_template(id,family_id,name,version,file_key,file_type,page_width,page_height,fields,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            tid,
            t.family_id,
            t.name,
            Number(version.n) + 1,
            t.file_key,
            t.file_type,
            p.page_width,
            p.page_height,
            JSON.stringify(p.fields),
            "DRAFT",
            actor.id,
            now(),
          ),
          audit(actor, "TEMPLATE_REVISED", "report_template", tid),
        ]);
        return respond({ id: tid });
      }
      await rt.db.batch([
        sql(
          "UPDATE report_template SET fields=?,page_width=?,page_height=? WHERE id=?",
          JSON.stringify(p.fields),
          p.page_width,
          p.page_height,
          key,
        ),
        audit(actor, "TEMPLATE_SAVED", "report_template", key),
      ]);
      return respond({ id: key });
    }
    if (route === "report-batches") {
      staff(actor);
      if (!key && method === "GET")
        return respond(
          await rt.db.all(
            "SELECT * FROM report_batch ORDER BY created_at DESC LIMIT 100",
          ),
        );
      if (!key && method === "POST") {
        const p = await body(
          req,
          z.object({
            runIds: z.array(id).min(1).max(12),
            templateId: id,
            individuals: z.boolean().default(false),
            sort: z.enum(["rank", "id", "name"]).default("rank"),
          }),
        );
        const template = await one(
          rt.db,
          "SELECT * FROM report_template WHERE id=?",
          [p.templateId],
        );
        demand(
          template?.status === "APPROVED",
          "TEMPLATE_NOT_APPROVED",
          "Choose an approved template.",
        );
        const seen = new Set(),
          statements: Statement[] = [];
        for (const rid of p.runIds) {
          const r = await one(rt.db, "SELECT * FROM result_run WHERE id=?", [
            rid,
          ]);
          demand(
            r?.status === "APPROVED",
            "NOT_APPROVED",
            "All selected result runs must be approved.",
          );
          demand(
            !seen.has(r.section_id),
            "DUPLICATE_SECTION",
            "Select only one result revision per section.",
          );
          seen.add(r.section_id);
          const c = await coverage(rt.db, r.term_id, r.section_id);
          demand(
            c.ready &&
              c.revision === r.scope_revision &&
              school.revision === r.school_revision,
            "STALE_RESULT_RUN",
            "A selected result is stale. Recalculate and approve the current revision.",
          );
          const students = await rt.db.all(
            "SELECT * FROM student_result WHERE run_id=?",
            [rid],
          );
          demand(
            students.length <= 500,
            "SECTION_LIMIT",
            "A section batch supports up to 500 students.",
          );
          demand(
            !parse(school.settings).gradeRankRequired ||
              students.every((s) => s.grade_rank !== null),
            "GRADE_RANK_REQUIRED",
            "Approve all grade sections together before exporting.",
          );
          demand(
            !fieldErrors(
              parse(template.fields),
              Number(template.page_width),
              Number(template.page_height),
              c.offerings.length,
            ).length,
            "TEMPLATE_MAPPING_INCOMPLETE",
            "Template does not fit this subject list.",
          );
          statements.push(
            ...scopeGuard(r.term_id, r.section_id, r.scope_revision),
          );
        }
        const bid = uid();
        statements.push(
          ...guard(
            "EXISTS(SELECT 1 FROM school WHERE revision=?)",
            school.revision,
          ),
          sql(
            "INSERT INTO report_batch(id,template_id,run_ids,status,options,total,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",
            bid,
            p.templateId,
            JSON.stringify(p.runIds),
            "QUEUED",
            JSON.stringify({ individuals: p.individuals, sort: p.sort }),
            p.runIds.length,
            actor.id,
            now(),
          ),
          audit(actor, "REPORT_QUEUED", "report_batch", bid, {
            sections: p.runIds.length,
          }),
        );
        await rt.db.batch(statements);
        if (rt.enqueue) await rt.enqueue(bid);
        // Keep rendering after the response is sent so the batch completes even
        // if the user navigates away from the tab that started it.
        else rt.waitUntil?.(runJob(rt, bid, 45000).catch(() => {}));
        return respond({ id: bid });
      }
      const b = await one(rt.db, "SELECT * FROM report_batch WHERE id=?", [
        key,
      ]);
      demand(b, "NOT_FOUND", "Report batch not found.", 404);
      if (action === "download") {
        demand(
          b.status === "COMPLETED",
          "NOT_READY",
          "Report batch is not complete.",
        );
        return download(
          rt,
          actor,
          b.zip_key,
          "Report_Cards.zip",
          "application/zip",
        );
      }
      if (action === "manifest") {
        demand(
          b.status === "COMPLETED",
          "NOT_READY",
          "Report batch is not complete.",
        );
        return download(
          rt,
          actor,
          "reports/" + key + "/manifest.csv",
          "manifest.csv",
          "text/csv",
        );
      }
      if (action === "file") {
        const f = await one(
          rt.db,
          "SELECT * FROM report_file WHERE id=? AND batch_id=?",
          [url.searchParams.get("file"), key],
        );
        demand(f, "NOT_FOUND", "Report file not found.", 404);
        return download(
          rt,
          actor,
          f.storage_key,
          f.filename.split("/").pop(),
          "application/pdf",
          url.searchParams.get("inline") === "1",
        );
      }
      if (method === "POST" && action === "process") {
        if (rt.enqueue) await rt.enqueue(key);
        // Drain as many sections as the request budget allows rather than a
        // single section, so a batch finishes promptly instead of only while
        // the browser tab keeps polling.
        else await runJob(rt, key, 45000);
        return respond({ ok: true });
      }
      if (method === "POST" && action === "cancel") {
        demand(
          ["QUEUED", "FAILED"].includes(b.status),
          "JOB_RUNNING",
          "Only queued or failed jobs can be cancelled.",
        );
        const objects = await rt.db.all(
          "SELECT storage_key FROM report_file WHERE batch_id=?",
          [key],
        );
        await rt.db.batch([
          ...guard(
            "EXISTS(SELECT 1 FROM report_batch WHERE id=? AND status IN('QUEUED','FAILED'))",
            key,
          ),
          sql("UPDATE report_batch SET status='CANCELLED' WHERE id=?", key),
          sql("DELETE FROM report_file WHERE batch_id=?", key),
          audit(actor, "REPORT_CANCELLED", "report_batch", key),
        ]);
        // A cancelled batch will never be downloaded, so reclaim the section
        // PDFs and ZIP it had already written instead of leaving them orphaned
        // in storage forever.
        if (rt.storage.delete) {
          for (const o of objects) await rt.storage.delete(o.storage_key);
          if (b.zip_key) await rt.storage.delete(b.zip_key);
        }
        return respond({ ok: true });
      }
      return respond({
        ...b,
        files: await rt.db.all("SELECT * FROM report_file WHERE batch_id=?", [
          key,
        ]),
      });
    }
    if (route === "settings") {
      allow(actor, "SYSTEM_ADMIN");
      if (method === "GET")
        return respond({ ...school, settings: parse(school.settings) });
      const p = await body(
        req,
        z.object({
          name: str,
          timezone: str,
          address: z.string().max(500),
          selfApproval: z.boolean(),
          gradeRankRequired: z.boolean(),
        }),
      );
      try {
        new Intl.DateTimeFormat("en", { timeZone: p.timezone }).format();
      } catch {
        throw new AppError(
          "INVALID_TIMEZONE",
          "Choose a valid IANA time zone.",
        );
      }
      await rt.db.batch([
        sql(
          "UPDATE school SET name=?,timezone=?,address=?,settings=?,revision=revision+1 WHERE id=?",
          p.name,
          p.timezone,
          p.address,
          JSON.stringify({
            ...parse(school.settings),
            selfApproval: p.selfApproval,
            gradeRankRequired: p.gradeRankRequired,
          }),
          "school",
        ),
        audit(actor, "SCHOOL_SETTINGS_CHANGED", "school", "school", {
          selfApproval: p.selfApproval,
          gradeRankRequired: p.gradeRankRequired,
        }),
      ]);
      return respond({ ok: true });
    }
    if (route === "setup-items") {
      allow(actor, "SYSTEM_ADMIN", "REGISTRAR");
      const p = await body(
          req,
          z.object({
            kind: z.enum([
              "year",
              "term",
              "grade",
              "section",
              "subject",
              "offering",
            ]),
            label: str.optional(),
            year_id: id.optional(),
            grade_id: id.optional(),
            subject_id: id.optional(),
            code: str.optional(),
            maximum: z.string().optional(),
            weight: z.string().optional(),
          }),
        ),
        newId = uid(),
        s: Statement[] = [];
      if (p.kind === "year")
        s.push(
          sql(
            "INSERT INTO academic_year(id,label) VALUES(?,?)",
            newId,
            p.label,
          ),
        );
      if (p.kind === "term") {
        s.push(
          sql(
            "INSERT INTO term(id,year_id,label) VALUES(?,?,?)",
            newId,
            p.year_id,
            p.label,
          ),
        );
        for (const sec of await rt.db.all("SELECT id FROM section"))
          s.push(
            sql(
              "INSERT INTO scope_state(id,term_id,section_id) VALUES(?,?,?)",
              newId + ":" + sec.id,
              newId,
              sec.id,
            ),
          );
      }
      if (p.kind === "grade")
        s.push(
          sql(
            "INSERT INTO grade(id,label,sort_order) VALUES(?,?,?)",
            newId,
            p.label,
            Number(p.label) || 99,
          ),
        );
      if (p.kind === "section") {
        s.push(
          sql(
            "INSERT INTO section(id,grade_id,label) VALUES(?,?,?)",
            newId,
            p.grade_id,
            p.label,
          ),
        );
        for (const term of await rt.db.all("SELECT id FROM term"))
          s.push(
            sql(
              "INSERT INTO scope_state(id,term_id,section_id) VALUES(?,?,?)",
              term.id + ":" + newId,
              term.id,
              newId,
            ),
          );
      }
      if (p.kind === "subject")
        s.push(
          sql(
            "INSERT INTO subject(id,name,code) VALUES(?,?,?)",
            newId,
            p.label,
            p.code,
          ),
        );
      if (p.kind === "offering") {
        demand(
          Number(p.maximum) > 0 &&
            Number(p.weight) > 0 &&
            Number(p.maximum) <= 10000 &&
            Number(p.weight) <= 1000,
          "INVALID_CURRICULUM",
          "Maximum and weight must be positive within supported limits.",
        );
        s.push(
          sql(
            "INSERT INTO offering(id,grade_id,subject_id,maximum,weight) VALUES(?,?,?,?,?)",
            newId,
            p.grade_id,
            p.subject_id,
            p.maximum,
            p.weight,
          ),
          sql(
            "UPDATE scope_state SET revision=revision+1 WHERE section_id IN(SELECT id FROM section WHERE grade_id=?)",
            p.grade_id,
          ),
        );
      }
      s.push(audit(actor, "ACADEMIC_SETUP_CREATED", p.kind, newId));
      await rt.db.batch(s);
      return respond({ id: newId });
    }
    if (route === "users") {
      allow(actor, "SYSTEM_ADMIN");
      if (method === "GET")
        return respond(
          (
            await rt.db.all(
              "SELECT id,name,email username,roles,active,created_at FROM users ORDER BY name",
            )
          ).map((u) => ({ ...u, roles: parse(u.roles) })),
        );
      const p = await body(
        req,
        z.object({
          name: str,
          username: z.string().trim().min(3).max(100),
          roles: z
            .array(z.enum(["SYSTEM_ADMIN", "REGISTRAR", "TEACHER", "APPROVER"]))
            .min(1),
          active: z.boolean().default(true),
          password: z.string().min(12).max(128).optional(),
        }),
      );
      if (key === actor.id)
        demand(
          p.active && p.roles.includes("SYSTEM_ADMIN"),
          "SELF_LOCKOUT",
          "You cannot remove your own administrator access.",
        );
      const clash = await one(
        rt.db,
        "SELECT id FROM users WHERE LOWER(email)=? AND id<>?",
        [p.username.toLowerCase(), key || ""],
      );
      demand(!clash, "USERNAME_TAKEN", "That username is already in use.");
      const password = p.password ? await bcrypt.hash(p.password, 12) : null;
      if (key) {
        await rt.db.batch([
          sql(
            "UPDATE users SET name=?,email=?,roles=?,active=? WHERE id=?",
            p.name,
            p.username.toLowerCase(),
            JSON.stringify(p.roles),
            p.active ? 1 : 0,
            key,
          ),
          ...(password
            ? [
                sql(
                  "UPDATE users SET password_hash=? WHERE id=?",
                  password,
                  key,
                ),
              ]
            : []),
          sql("DELETE FROM session WHERE user_id=?", key),
          audit(actor, "USER_UPDATED", "user", key, {
            roles: p.roles,
            active: p.active,
          }),
        ]);
        return respond({ id: key });
      }
      demand(
        !!password,
        "PASSWORD_REQUIRED",
        "Set an initial password of at least 12 characters.",
      );
      const newId = uid();
      await rt.db.batch([
        sql(
          "INSERT INTO users(id,name,email,password_hash,roles,active,created_at) VALUES(?,?,?,?,?,?,?)",
          newId,
          p.name,
          p.username.toLowerCase(),
          password,
          JSON.stringify(p.roles),
          p.active ? 1 : 0,
          now(),
        ),
        audit(actor, "USER_CREATED", "user", newId, { roles: p.roles }),
      ]);
      return respond({ id: newId });
    }
    if (route === "audit") {
      staff(actor);
      const q = like(url.searchParams.get("q") || ""),
        page = Math.max(1, Number(url.searchParams.get("page") || 1));
      return respond(
        await rt.db.all(
          "SELECT a.*,u.name actor FROM audit_event a LEFT JOIN users u ON u.id=a.actor_id WHERE LOWER(a.action) LIKE LOWER(?) OR a.entity_id LIKE ? ORDER BY a.created_at DESC LIMIT 50 OFFSET ?",
          [q, q, (page - 1) * 50],
        ),
      );
    }
    throw new AppError("NOT_FOUND", "Page or action not found.", 404);
  } catch (error: any) {
    if (error instanceof z.ZodError)
      return respond(
        {
          error: "VALIDATION_ERROR",
          message: error.issues
            .map((i) => i.path.join(".") + ": " + i.message)
            .join("; "),
        },
        400,
      );
    if (error instanceof AppError)
      return respond(
        { error: error.code, message: error.message },
        error.status,
      );
    if (
      /transaction_guard|unique constraint|duplicate key|immutable|score_scope|assignment_scope/i.test(
        String(error.message),
      )
    )
      return respond(
        {
          error: "CONFLICT",
          message:
            "This record changed, already exists, or is locked. Refresh and try again.",
        },
        409,
      );
    console.error(
      JSON.stringify({
        event: "api_error",
        type: error.name,
        code: error.code || "INTERNAL",
      }),
    );
    return respond(
      {
        error: "INTERNAL_ERROR",
        message:
          "The operation could not be completed. Please retry or contact the administrator.",
      },
      500,
    );
  }
}

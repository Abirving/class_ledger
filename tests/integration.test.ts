import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  fixture,
  admin,
  principal,
  teacher,
  json,
  xlsxBytes,
} from "./helpers";
import { coverage, roster } from "../lib/server/data";
import { stage, commit } from "../lib/server/imports";
import { calculate, approve } from "../lib/server/results";
import { one, sql, parse } from "../lib/server/contracts";
import { processBatch } from "../lib/server/pdf";
import { PDFDocument } from "pdf-lib";
import { unzipSync, strFromU8 } from "fflate";
import { mkdir, writeFile } from "node:fs/promises";
let f: Awaited<ReturnType<typeof fixture>>,
  aRun: string,
  bRun: string,
  batchId: string;
beforeAll(async () => {
  f = await fixture();
});
afterAll(async () => {
  await f.pg.close();
});
describe("persisted school workflow", () => {
  it("counts real 50-student data and independent A/B readiness", async () => {
    const d = await json(await f.call("overview?term=term-1"));
    expect(d.students).toBe(50);
    expect(d.missing).toBe(2);
    expect(d.ready).toBe(1);
    expect((await coverage(f.rt.db, "term-1", "section-A")).ready).toBe(false);
    expect((await coverage(f.rt.db, "term-1", "section-B")).ready).toBe(true);
  });
  it("denies unauthenticated reads and teacher cross-assignment access", async () => {
    expect((await f.call("students", undefined, undefined, null)).status).toBe(
      401,
    );
    expect(
      (
        await f.call(
          "assignments/assignment-A-ENG/template",
          undefined,
          undefined,
          teacher,
        )
      ).status,
    ).toBe(403);
    expect((await f.call("users", undefined, undefined, teacher)).status).toBe(
      403,
    );
  });
  it("exposes the reported allegation without creating zero", async () => {
    const d = await json(await f.call("exceptions/exception-1005"));
    expect(d.code).toBe("1005");
    expect(d.full_name).toBe("Abel Tesfaye");
    expect(d.reason).toBe("REPORTED_MISCONDUCT");
    expect(
      await one(
        f.rt.db,
        "SELECT id FROM score WHERE enrollment_id='enrollment-1005' AND offering_id='offering-MATH' AND effective=1",
      ),
    ).toBeUndefined();
  });
  it("blocks incomplete result calculation but preserves a legitimate zero", async () => {
    await expect(
      calculate(f.rt, admin, "term-1", "section-A"),
    ).rejects.toMatchObject({ code: "INCOMPLETE_SCOPE" });
    expect(
      Number(
        (
          await one(
            f.rt.db,
            "SELECT value FROM score WHERE enrollment_id='enrollment-2015' AND offering_id='offering-MATH' AND effective=1",
          )
        ).value,
      ),
    ).toBe(0);
  });
  it("allows complete B and requires a distinct authorized approver", async () => {
    bRun = (await calculate(f.rt, admin, "term-1", "section-B")).id;
    await expect(approve(f.rt, admin, [bRun])).rejects.toMatchObject({
      code: "SEPARATE_APPROVER",
    });
    await approve(f.rt, principal, [bRun]);
    expect(
      (await one(f.rt.db, "SELECT status FROM result_run WHERE id=?", [bRun]))
        .status,
    ).toBe("APPROVED");
  });
  it("resolves missing cases explicitly and prevents competing decisions", async () => {
    for (const code of ["1005", "1012"]) {
      const result = await f.call(
        "exceptions/exception-" + code,
        "POST",
        {
          action: "RESOLVE",
          justification:
            "Authorized assessment record reviewed by the principal.",
          value: code === "1005" ? "72" : "81",
          revision: 1,
        },
        principal,
      );
      expect(result.status).toBe(200);
    }
    const again = await f.call(
      "exceptions/exception-1005",
      "POST",
      {
        action: "RESOLVE",
        justification: "Second concurrent decision should fail.",
        value: "0",
        revision: 1,
      },
      principal,
    );
    expect(again.status).toBe(409);
    expect((await coverage(f.rt.db, "term-1", "section-A")).ready).toBe(true);
  });
  it("calculates and approves A with immutable source snapshots", async () => {
    aRun = (await calculate(f.rt, admin, "term-1", "section-A")).id;
    await approve(f.rt, principal, [aRun]);
    await expect(
      f.rt.db.batch([
        sql("UPDATE student_result SET average=0 WHERE run_id=?", aRun),
      ]),
    ).rejects.toThrow("immutable");
    await expect(
      f.rt.db.batch([
        sql("DELETE FROM audit_event WHERE action='SCHOOL_CREATED'"),
      ]),
    ).rejects.toThrow("immutable");
  });
  it("rejects unapproved export IDs and creates real jobs", async () => {
    expect(
      (
        await f.call("report-batches", "POST", {
          runIds: ["not-a-run"],
          templateId: "template-sample",
        })
      ).status,
    ).toBe(400);
    const r = await f.call("report-batches", "POST", {
      runIds: [aRun, bRun],
      templateId: "template-sample",
      individuals: true,
      sort: "id",
    });
    expect(r.status).toBe(200);
    batchId = (await json(r)).id;
  });
  it("renders 20 and 30 personalized pages and a complete ZIP with idempotent retry", async () => {
    for (let i = 0; i < 3; i++) await processBatch(f.rt, batchId);
    const b = await one(f.rt.db, "SELECT * FROM report_batch WHERE id=?", [
      batchId,
    ]);
    expect(b.status).toBe("COMPLETED");
    const zip = unzipSync(f.files.get(b.zip_key)!);
    expect(
      (await PDFDocument.load(zip["Grade_08/Section_A.pdf"])).getPageCount(),
    ).toBe(20);
    expect(
      (await PDFDocument.load(zip["Grade_08/Section_B.pdf"])).getPageCount(),
    ).toBe(30);
    expect(
      Object.keys(zip).filter((k) => k.includes("/Students/")),
    ).toHaveLength(50);
    expect(strFromU8(zip["manifest.csv"])).toContain('"20"');
    expect(strFromU8(zip["manifest.csv"])).toContain('"30"');
    const before = await f.rt.db.all(
      "SELECT id FROM report_file WHERE batch_id=?",
      [batchId],
    );
    await processBatch(f.rt, batchId);
    expect(
      await f.rt.db.all("SELECT id FROM report_file WHERE batch_id=?", [
        batchId,
      ]),
    ).toEqual(before);
    await mkdir("outputs/qa", { recursive: true });
    await writeFile("outputs/qa/Section_A.pdf", zip["Grade_08/Section_A.pdf"]);
    await writeFile("outputs/qa/Section_B.pdf", zip["Grade_08/Section_B.pdf"]);
    await writeFile("outputs/qa/Report_Cards.zip", f.files.get(b.zip_key)!);
  });
  it("requires admin review for post-approval teacher correction and retains old results", async () => {
    const students = await roster(f.rt.db, "term-1", "section-B"),
      bytes = await xlsxBytes([
        ["Student ID", "Score"],
        ...students.map((s) => [s.code, 88]),
      ]);
    const staged = await stage(f.rt, teacher, {
      assignmentId: "assignment-B-MATH",
      bytes,
      filename: "correction.xlsx",
      reason: "Correcting the reviewed assessment score.",
    });
    await expect(commit(f.rt, teacher, staged.id)).rejects.toMatchObject({
      status: 403,
    });
    const old = await f.rt.db.all(
      "SELECT average FROM student_result WHERE run_id=? ORDER BY student_code",
      [bRun],
    );
    await commit(f.rt, admin, staged.id);
    expect(
      await f.rt.db.all(
        "SELECT average FROM student_result WHERE run_id=? ORDER BY student_code",
        [bRun],
      ),
    ).toEqual(old);
    expect(
      (
        await f.call("report-batches", "POST", {
          runIds: [bRun],
          templateId: "template-sample",
        })
      ).status,
    ).toBe(400);
  });
  it("rejects stale snapshot approval after roster revision", async () => {
    const run = await calculate(f.rt, admin, "term-1", "section-B");
    await f.rt.db.batch([
      sql(
        "UPDATE scope_state SET revision=revision+1 WHERE section_id='section-B'",
      ),
    ]);
    await expect(approve(f.rt, principal, [run.id])).rejects.toMatchObject({
      code: "STALE_RESULT_RUN",
    });
  });
  it("enforces score and assignment scope in the PostgreSQL database", async () => {
    await expect(
      f.rt.db.batch([
        sql(
          "INSERT INTO score(id,enrollment_id,term_id,offering_id,value,actor_id,revision,created_at) VALUES(?,?,?,?,?,?,?,?)",
          "bad",
          "enrollment-1001",
          "term-1",
          "offering-MATH",
          101,
          "admin",
          99,
          new Date().toISOString(),
        ),
      ]),
    ).rejects.toThrow("score_scope");
  });
  it("deactivated accounts lose existing access", async () => {
    await f.rt.db.batch([
      sql("UPDATE users SET active=0 WHERE id='teacher-MATH'"),
    ]);
    expect(
      (await f.call("assignments", undefined, undefined, teacher)).status,
    ).toBe(401);
  });
});
describe("transactional imports", () => {
  let g: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => {
    g = await fixture();
  });
  afterAll(async () => {
    await g.pg.close();
  });
  it("invalid rows cannot partially overwrite official marks", async () => {
    const before = await g.rt.db.all(
      "SELECT id FROM score WHERE effective=1 ORDER BY id",
    );
    const staged = await stage(g.rt, teacher, {
      assignmentId: "assignment-A-MATH",
      filename: "invalid.xlsx",
      bytes: await xlsxBytes([
        ["Student ID", "Grade", "Section", "Score"],
        ["1001", "8", "B", "110"],
        ["1001", "8", "A", "80"],
        ["9999", "8", "A", "80"],
      ]),
    });
    expect(staged.status).toBe("INVALID");
    await expect(commit(g.rt, teacher, staged.id)).rejects.toMatchObject({
      code: "INVALID_BATCH",
    });
    expect(
      await g.rt.db.all("SELECT id FROM score WHERE effective=1 ORDER BY id"),
    ).toEqual(before);
  });
  it("merges reverse row order, preserves missing reasons, and reports omitted student", async () => {
    const students = (await roster(g.rt.db, "term-1", "section-A"))
      .reverse()
      .filter((s) => s.code !== "1019");
    const bytes = await xlsxBytes([
      ["Student ID", "Score", "Reason"],
      ...students.map((s) => [
        s.code,
        s.code === "1005" ? "-" : s.code === "1001" ? "0" : "80",
        s.code === "1005" ? "REPORTED_MISCONDUCT" : "",
      ]),
    ]);
    const staged = await stage(g.rt, teacher, {
      assignmentId: "assignment-A-MATH",
      filename: "reverse.xlsx",
      bytes,
    });
    await commit(g.rt, teacher, staged.id);
    expect(
      Number(
        (
          await one(
            g.rt.db,
            "SELECT value FROM score WHERE enrollment_id='enrollment-1001' AND offering_id='offering-MATH' AND effective=1",
          )
        ).value,
      ),
    ).toBe(0);
    expect(
      (
        await one(
          g.rt.db,
          "SELECT kind FROM score_exception WHERE enrollment_id='enrollment-1019' AND status='OPEN'",
        )
      ).kind,
    ).toBe("OMITTED_ROW");
    expect(
      (
        await stage(g.rt, teacher, {
          assignmentId: "assignment-A-MATH",
          filename: "duplicate.xlsx",
          bytes,
        })
      ).duplicate,
    ).toBe(true);
  });
  it("serializes competing commits and rejects obsolete submission", async () => {
    const students = await roster(g.rt.db, "term-1", "section-A");
    const make = async (v: number) =>
      stage(g.rt, teacher, {
        assignmentId: "assignment-A-MATH",
        filename: v + ".xlsx",
        bytes: await xlsxBytes([
          ["Student ID", "Score"],
          ...students.map((s) => [s.code, v]),
        ]),
      });
    const first = await make(83),
      second = await make(84);
    await commit(g.rt, teacher, first.id);
    await expect(commit(g.rt, teacher, second.id)).rejects.toMatchObject({
      code: "STALE_SUBMISSION",
    });
    await commit(g.rt, teacher, first.id);
    expect(
      (
        await one(
          g.rt.db,
          "SELECT COUNT(*) n FROM score WHERE term_id='term-1' AND offering_id='offering-MATH' AND effective=1",
        )
      ).n,
    ).toBe(50);
  });
  it("stages a Word mark sheet from a table in the document", async () => {
    const students = await roster(g.rt.db, "term-1", "section-A"),
      rows = [
        ["Student ID", "Score"],
        ...students.map((s) => [s.code, "75"]),
      ],
      body =
        "<w:tbl>" +
        rows
          .map(
            (r) =>
              "<w:tr>" +
              r.map(
                (c) =>
                  "<w:tc><w:p><w:r><w:t>" + c + "</w:t></w:r></w:p></w:tc>",
              ).join("") +
              "</w:tr>",
          )
          .join("") +
        "</w:tbl>",
      staged = await stage(g.rt, teacher, {
        assignmentId: "assignment-A-MATH",
        filename: "marks.docx",
        bytes: zipSync({ "word/document.xml": strToU8(body) }),
        reason: "Uploading the revised Word mark sheet.",
      });
    expect(staged.status).toBe("STAGED");
    expect(
      (
        await one(
          g.rt.db,
          "SELECT COUNT(*) n FROM import_row WHERE batch_id=?",
          [staged.id],
        )
      ).n,
    ).toBe(students.length);
  });
});
describe("grade approval and template versions", () => {
  let h: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => {
    h = await fixture();
  });
  afterAll(async () => {
    await h.pg.close();
  });
  it("withholds grade rank until every section is ready", async () => {
    const b = await calculate(h.rt, admin, "term-1", "section-B");
    await expect(approve(h.rt, principal, [b.id], true)).rejects.toMatchObject({
      code: "GRADE_INCOMPLETE",
    });
    for (const code of ["1005", "1012"])
      await h.call(
        "exceptions/exception-" + code,
        "POST",
        {
          action: "RESOLVE",
          justification: "Assessment verified by school principal.",
          value: "80",
          revision: 1,
        },
        principal,
      );
    const a = await calculate(h.rt, admin, "term-1", "section-A");
    await approve(h.rt, principal, [a.id, b.id], true);
    const rows = await h.rt.db.all(
      "SELECT grade_rank FROM student_result WHERE run_id IN(?,?)",
      [a.id, b.id],
    );
    expect(rows).toHaveLength(50);
    expect(rows.every((r) => r.grade_rank > 0)).toBe(true);
  });
  it("editing an approved template creates a new draft and leaves the old one unchanged", async () => {
    const t = await json(await h.call("templates/template-sample"));
    const modified = t.fields.map((f: any) => ({ ...f, color: "#123456" }));
    const result = await json(
      await h.call("templates/template-sample/fields", "PUT", {
        fields: modified,
        page_width: Number(t.page_width),
        page_height: Number(t.page_height),
      }),
    );
    expect(result.id).not.toBe("template-sample");
    const old = await json(await h.call("templates/template-sample")),
      next = await json(await h.call("templates/" + result.id));
    expect(old.status).toBe("APPROVED");
    expect(old.fields[0].color).toBe("#142A3B");
    expect(next.status).toBe("DRAFT");
    expect(next.version).toBe(2);
  });
});

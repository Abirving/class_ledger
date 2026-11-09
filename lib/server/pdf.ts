import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { zipSync, strToU8 } from "fflate";
import {
  Runtime,
  one,
  demand,
  parse,
  sql,
  guard,
  hash,
  uid,
  now,
} from "./contracts";
import { Field, fieldErrors, csv } from "../domain/academic";
function color(s: string) {
  return /^#[0-9a-f]{6}$/i.test(s)
    ? rgb(
        parseInt(s.slice(1, 3), 16) / 255,
        parseInt(s.slice(3, 5), 16) / 255,
        parseInt(s.slice(5, 7), 16) / 255,
      )
    : rgb(0.08, 0.16, 0.23);
}
const ethiopic = (c: string) =>
  /[\u1200-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/.test(c);
function width(s: string, size: number, latin: PDFFont, ethi: PDFFont) {
  return [...s].reduce(
    (n, c) => n + (ethiopic(c) ? ethi : latin).widthOfTextAtSize(c, size),
    0,
  );
}
function drawText(
  page: PDFPage,
  text: string,
  f: Field,
  latin: PDFFont,
  ethi: PDFFont,
) {
  let size = f.fontSize;
  const layout = () => {
    const out: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const candidate = line ? line + " " + word : word;
      if (width(candidate, size, latin, ethi) <= f.width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      line = "";
      for (const c of word) {
        if (width(line + c, size, latin, ethi) > f.width) {
          out.push(line);
          line = c;
        } else line += c;
      }
    }
    if (line) out.push(line);
    return out;
  };
  let lines = layout();
  while (
    f.overflow === "shrink" &&
    size > 8 &&
    lines.length * size * 1.35 > f.height
  ) {
    size -= 0.5;
    lines = layout();
  }
  demand(
    lines.length * size * 1.35 <= f.height &&
      !(f.overflow === "error" && lines.length > 1),
    "PDF_TEXT_OVERFLOW",
    `Text does not fit ${f.key}. Increase field size or enable wrapping.`,
  );
  lines.forEach((line, i) => {
    let x =
      f.x +
      (f.align === "center"
        ? (f.width - width(line, size, latin, ethi)) / 2
        : f.align === "right"
          ? f.width - width(line, size, latin, ethi)
          : 0);
    const y = page.getHeight() - f.y - size - i * size * 1.35;
    let chunk = "",
      last = false;
    const flush = () => {
      if (!chunk) return;
      const font = last ? ethi : latin;
      page.drawText(chunk, { x, y, size, font, color: color(f.color) });
      x += font.widthOfTextAtSize(chunk, size);
      chunk = "";
    };
    for (const c of line) {
      const current = ethiopic(c);
      if (current !== last) flush();
      last = current;
      chunk += c;
    }
    flush();
  });
}
export async function render(
  rt: Runtime,
  template: any,
  run: any,
  students: any[],
) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const latin = await doc.embedFont(StandardFonts.Helvetica),
    serif = await doc.embedFont(StandardFonts.TimesRoman),
    bold = await doc.embedFont(StandardFonts.HelveticaBold),
    ethi = await doc.embedFont(await rt.font(), { subset: true }),
    fields = parse<Field[]>(template.fields);
  const background = template.file_key
    ? await rt.storage.get(template.file_key)
    : null;
  const source =
    background && template.file_type === "PDF"
      ? await PDFDocument.load(background)
      : null;
  const image =
    background && template.file_type !== "PDF"
      ? template.file_type === "PNG"
        ? await doc.embedPng(background)
        : await doc.embedJpg(background)
      : null;
  const p = parse(run.policy);
  for (const student of students) {
    const marks = await rt.db.all(
      "SELECT * FROM result_mark WHERE student_result_id=? ORDER BY subject_name",
      [student.id],
    );
    demand(
      !fieldErrors(
        fields,
        Number(template.page_width),
        Number(template.page_height),
        marks.length,
      ).length,
      "TEMPLATE_MAPPING_INCOMPLETE",
      "Template is not suitable for this subject list.",
    );
    let page: PDFPage;
    if (source) {
      const [copied] = await doc.copyPages(source, [0]);
      page = doc.addPage(copied);
    } else {
      page = doc.addPage([
        Number(template.page_width),
        Number(template.page_height),
      ]);
      if (image)
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: page.getWidth(),
          height: page.getHeight(),
        });
    }
    if (template.file_type === "SAMPLE") {
      page.drawRectangle({
        x: 40,
        y: page.getHeight() - 92,
        width: 515,
        height: 3,
        color: rgb(0.05, 0.55, 0.53),
      });
      page.drawText("ACADEMIC REPORT CARD", {
        x: 40,
        y: page.getHeight() - 113,
        size: 10,
        font: bold,
        color: rgb(0.36, 0.44, 0.5),
      });
      page.drawText("SAMPLE LAYOUT  |  " + p.year, {
        x: 40,
        y: 48,
        size: 8,
        font: latin,
        color: rgb(0.4, 0.45, 0.5),
      });
    }
    const values: Record<string, string> = {
      school_name: p.school_name,
      full_name: student.full_name,
      student_code: "Student ID · " + student.student_code,
      class: "Grade " + p.grade + " · " + p.section,
      grade: p.grade,
      section: p.section,
      year: p.year,
      term: p.term,
      total: "Total · " + Number(student.total).toFixed(2),
      max_total: String(student.max_total),
      average: "Average · " + Number(student.average).toFixed(2) + "%",
      section_rank: "Section rank · " + student.section_rank,
      grade_rank: student.grade_rank ? String(student.grade_rank) : "Pending",
      issue_date: run.approved_at.slice(0, 10),
      approver: run.approver || "",
      template_revision: String(template.version),
      report_ref: `${student.student_code} / Result v${run.revision} / Template v${template.version} / ${run.id.slice(0, 8)}`,
    };
    for (const f of fields) {
      const face = f.fontFamily === "serif" ? serif : latin;
      if (f.key !== "subject_table") {
        drawText(page, values[f.key] || "", f, face, ethi);
        continue;
      }
      page.drawRectangle({
        x: f.x,
        y: page.getHeight() - f.y - 28,
        width: f.width,
        height: 28,
        color: rgb(0.09, 0.2, 0.29),
      });
      for (const [text, offset, w] of [
        ["SUBJECT", 10, f.width * 0.54],
        ["SCORE", f.width * 0.6, f.width * 0.17],
        ["MAX", f.width * 0.81, f.width * 0.17],
      ] as [string, number, number][]) {
        drawText(
          page,
          text,
          {
            ...f,
            x: f.x + offset,
            y: f.y + 7,
            width: w,
            height: 20,
            fontSize: 9,
            color: "#FFFFFF",
          },
          bold,
          ethi,
        );
      }
      marks.forEach((m, i) => {
        const y = f.y + 28 * (i + 1);
        if (i % 2 === 0)
          page.drawRectangle({
            x: f.x,
            y: page.getHeight() - y - 28,
            width: f.width,
            height: 28,
            color: rgb(0.96, 0.97, 0.98),
          });
        for (const [text, offset, w] of [
          [m.subject_name, 10, f.width * 0.54],
          [Number(m.value).toFixed(2), f.width * 0.6, f.width * 0.17],
          [String(m.maximum), f.width * 0.81, f.width * 0.17],
        ] as [string, number, number][])
          drawText(
            page,
            text,
            {
              ...f,
              x: f.x + offset,
              y: y + 6,
              width: w,
              height: 22,
              fontSize: 10,
            },
            latin,
            ethi,
          );
      });
    }
  }
  demand(
    doc.getPageCount() === students.length,
    "PAGE_COUNT_MISMATCH",
    "Generated page count differs from approved student count.",
  );
  return new Uint8Array(await doc.save());
}
export async function processBatch(rt: Runtime, id: string) {
  const batch = await one(rt.db, "SELECT * FROM report_batch WHERE id=?", [id]);
  if (!batch || ["COMPLETED", "CANCELLED"].includes(batch.status)) return;
  if (batch.lease_until && batch.lease_until > now()) return;
  const lease = new Date(Date.now() + 120000).toISOString();
  try {
    await rt.db.batch([
      ...guard(
        "EXISTS(SELECT 1 FROM report_batch WHERE id=? AND status IN('QUEUED','RUNNING','FAILED') AND (lease_until IS NULL OR lease_until<?))",
        id,
        now(),
      ),
      sql(
        "UPDATE report_batch SET status='RUNNING',lease_until=?,error=NULL WHERE id=?",
        lease,
        id,
      ),
    ]);
  } catch {
    return;
  }
  try {
    const ids = parse<string[]>(batch.run_ids),
      template = await one(rt.db, "SELECT * FROM report_template WHERE id=?", [
        batch.template_id,
      ]);
    const done = await rt.db.all("SELECT * FROM report_file WHERE batch_id=?", [
      id,
    ]);
    const next = ids.find((r) => !done.some((f) => f.run_id === r));
    const options = parse(batch.options);
    if (next) {
      const run = await one(
        rt.db,
        "SELECT r.*,u.name approver FROM result_run r JOIN users u ON u.id=r.approved_by WHERE r.id=?",
        [next],
      );
      demand(
        run?.status === "APPROVED",
        "NOT_APPROVED",
        "An approved result snapshot is required.",
      );
      const students = await rt.db.all(
        "SELECT * FROM student_result WHERE run_id=? ORDER BY " +
          (options.sort === "name"
            ? "full_name,student_code"
            : options.sort === "id"
              ? "student_code"
              : "section_rank,student_code"),
        [next],
      );
      const bytes = await render(rt, template, run, students),
        p = parse(run.policy),
        safe = (s: string) => s.replace(/[^\w-]/g, "_"),
        filename =
          "Grade_" +
          safe(p.grade.padStart(2, "0")) +
          "/Section_" +
          safe(p.section) +
          ".pdf",
        key = "reports/" + id + "/" + filename;
      await rt.storage.put(key, bytes, "application/pdf");
      await rt.db.batch([
        sql(
          "INSERT INTO report_file(id,batch_id,run_id,storage_key,filename,page_count,checksum) VALUES(?,?,?,?,?,?,?)",
          uid(),
          id,
          next,
          key,
          filename,
          students.length,
          await hash(bytes),
        ),
        sql(
          "UPDATE report_batch SET progress=progress+1,lease_until=NULL WHERE id=?",
          id,
        ),
      ]);
      return;
    }
    const files = await rt.db.all(
        "SELECT * FROM report_file WHERE batch_id=? ORDER BY filename",
        [id],
      ),
      zip: Record<string, Uint8Array> = {},
      manifest: unknown[][] = [
        [
          "filename",
          "student_count",
          "result_revision",
          "template_version",
          "generated_at",
          "sha256",
        ],
      ];
    for (const file of files) {
      const bytes = await rt.storage.get(file.storage_key);
      demand(bytes, "FILE_MISSING", "A generated section file is missing.");
      zip[file.filename] = bytes;
      const run = await one(
        rt.db,
        "SELECT revision FROM result_run WHERE id=?",
        [file.run_id],
      );
      manifest.push([
        file.filename,
        file.page_count,
        run.revision,
        template.version,
        now(),
        file.checksum,
      ]);
      if (options.individuals) {
        const doc = await PDFDocument.load(bytes),
          students = await rt.db.all(
            "SELECT student_code FROM student_result WHERE run_id=? ORDER BY " +
              (options.sort === "name"
                ? "full_name,student_code"
                : options.sort === "id"
                  ? "student_code"
                  : "section_rank,student_code"),
            [file.run_id],
          );
        for (let i = 0; i < students.length; i++) {
          const one = await PDFDocument.create();
          const [page] = await one.copyPages(doc, [i]);
          one.addPage(page);
          zip[
            file.filename.replace(".pdf", "") +
              "/Students/" +
              students[i].student_code.replace(/[^a-zA-Z0-9_-]/g, "_") +
              ".pdf"
          ] = await one.save();
        }
      }
    }
    zip["manifest.csv"] = strToU8(csv(manifest));
    const key = "reports/" + id + "/Report_Cards.zip";
    await rt.storage.put(key, zipSync(zip, { level: 6 }), "application/zip");
    await rt.storage.put(
      "reports/" + id + "/manifest.csv",
      zip["manifest.csv"],
      "text/csv",
    );
    await rt.db.batch([
      sql(
        "UPDATE report_batch SET status='COMPLETED',zip_key=?,completed_at=?,lease_until=NULL WHERE id=?",
        key,
        now(),
        id,
      ),
    ]);
  } catch (e: any) {
    await rt.db.batch([
      sql(
        "UPDATE report_batch SET status='FAILED',error=?,lease_until=NULL WHERE id=?",
        String(e.message || "PDF generation failed").slice(0, 500),
        id,
      ),
    ]);
    throw e;
  }
}
export async function runJob(rt: Runtime, id: string, budget = 25000) {
  const until = Date.now() + budget;
  while (Date.now() < until) {
    const b = await one(
      rt.db,
      "SELECT status,lease_until FROM report_batch WHERE id=?",
      [id],
    );
    if (
      !b ||
      ["COMPLETED", "CANCELLED"].includes(b.status) ||
      (b.lease_until && b.lease_until > now())
    )
      return;
    await processBatch(rt, id);
  }
}

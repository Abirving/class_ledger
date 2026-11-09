import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import { demand } from "./contracts";
import { scoreValue } from "../domain/academic";
export type Table = { headers: string[]; rows: string[][] };
const zipSignature = (bytes: Uint8Array) => bytes[0] === 80 && bytes[1] === 75;
function assertArchiveSafe(bytes: Uint8Array) {
  let expanded = 0,
    entries = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let p = 0; p + 46 < bytes.length; p++) {
    if (view.getUint32(p, true) === 0x02014b50) {
      expanded += view.getUint32(p + 24, true);
      entries++;
    }
  }
  demand(
    expanded <= 30 * 1024 * 1024 && entries <= 500,
    "UNSAFE_ARCHIVE",
    "Document decompression limit exceeded.",
  );
}
const decodeXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&amp;/g, "&");
function cellText(cell: string) {
  const paragraphs =
    cell.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) || [];
  const lines = paragraphs.map((p) =>
    (p.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g) || [])
      .map((run) => decodeXml(run.replace(/^<w:t\b[^>]*>/, "").slice(0, -6)))
      .join("")
      .trim(),
  );
  return lines.filter(Boolean).join(" ").trim();
}
const gridSpan = (cell: string) => {
  const m = cell.match(/<w:gridSpan\b[^>]*w:val="(\d+)"/);
  return m ? Math.max(1, Math.min(Number(m[1]), 30)) : 1;
};
function documentTable(bytes: Uint8Array): Table {
  demand(zipSignature(bytes), "INVALID_FILE", "The file is not a DOCX document.");
  assertArchiveSafe(bytes);
  let xml: string | null = null;
  try {
    const body = unzipSync(bytes)["word/document.xml"];
    if (body) xml = new TextDecoder().decode(body);
  } catch {}
  demand(xml, "INVALID_FILE", "The Word document could not be read.");
  const markup = (xml as string)
    .replace(/<w:del\b[\s\S]*?<\/w:del>/g, "")
    .replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/g, "");
  const tables = markup.match(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g) || [];
  demand(tables.length, "NO_TABLE_FOUND", "The Word document has no table.");
  demand(
    tables.length === 1,
    "MULTIPLE_TABLES",
    "Use a document containing one table.",
  );
  const rows: string[][] = [];
  for (const row of tables[0].match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || []) {
    const cells: string[] = [];
    for (const cell of row.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g) || []) {
      cells.push(cellText(cell));
      for (let n = 1; n < gridSpan(cell); n++) cells.push("");
    }
    rows.push(cells);
  }
  demand(
    rows.length <= 5001 && rows.every((r) => r.length <= 30),
    "FILE_LIMIT",
    "Limit: 5,000 rows and 30 columns.",
  );
  return { headers: rows.shift() || [], rows };
}
export async function parseFile(
  bytes: Uint8Array,
  name: string,
): Promise<Table> {
  demand(
    bytes.length <= 5 * 1024 * 1024,
    "FILE_TOO_LARGE",
    "Maximum upload size is 5 MB.",
  );
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return documentTable(bytes);
  demand(
    lower.endsWith(".xlsx"),
    "INVALID_FILE",
    "Upload an Excel (.xlsx) or Word (.docx) file.",
  );
  demand(
    zipSignature(bytes),
    "INVALID_FILE",
    "The file is not an XLSX workbook.",
  );
  assertArchiveSafe(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as any);
  demand(
    workbook.worksheets.length === 1,
    "MULTIPLE_SHEETS",
    "Use a workbook containing one worksheet.",
  );
  const sheet = workbook.worksheets[0];
  demand(
    sheet.rowCount <= 5001 && sheet.columnCount <= 30,
    "FILE_LIMIT",
    "Limit: 5,000 rows and 30 columns.",
  );
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: string[] = [];
    for (let n = 1; n <= sheet.columnCount; n++) {
      const cell = row.getCell(n);
      demand(
        cell.type !== ExcelJS.ValueType.Formula,
        "FORMULA_NOT_ALLOWED",
        `Formula found at ${cell.address}. Paste values before uploading.`,
      );
      values.push(cell.text.trim());
    }
    rows.push(values);
  });
  return { headers: rows.shift() || [], rows };
}
export const aliases: Record<string, string[]> = {
  code: ["studentid", "studentcode", "id"],
  name: ["fullname", "studentname", "name"],
  grade: ["grade"],
  section: ["section"],
  score: ["score", "mark", "marks"],
  reason: ["reason", "reasoncode"],
  remark: ["remark", "remarks", "comment"],
};
export function autoMap(headers: string[]) {
  return Object.fromEntries(
    Object.entries(aliases).map(([k, names]) => [
      k,
      headers.findIndex((h) =>
        names.includes(h.toLowerCase().replace(/[^a-z]/g, "")),
      ),
    ]),
  );
}
export function validate(
  table: Table,
  mapping: Record<string, number>,
  students: any[],
  assignment: any,
) {
  const codes = new Map(students.map((s) => [s.code, s])),
    seen = new Set<string>();
  return table.rows
    .filter((r) => r.some((c) => c.trim()))
    .map((raw, index) => {
      const get = (k: string) => String(raw[mapping[k]] ?? "").trim(),
        code = get("code"),
        student = codes.get(code),
        errors: string[] = [],
        warnings: string[] = [];
      if (!student) errors.push("STUDENT_NOT_FOUND");
      if (seen.has(code)) errors.push("DUPLICATE_ROW");
      seen.add(code);
      if (get("grade") && get("grade") !== assignment.grade)
        errors.push("ENROLLMENT_MISMATCH: grade " + assignment.grade);
      if (get("section") && get("section") !== assignment.section)
        errors.push("ENROLLMENT_MISMATCH: section " + assignment.section);
      if (student && get("name") && get("name") !== student.full_name)
        warnings.push(
          "Name differs from the official roster; Student ID is used.",
        );
      let value: string | null = null;
      try {
        value = scoreValue(get("score"), assignment.maximum);
      } catch {
        errors.push("INVALID_SCORE");
      }
      const reason = get("reason");
      if (
        reason &&
        !["ABSENT", "REPORTED_MISCONDUCT", "NOT_SUBMITTED", "OTHER"].includes(
          reason,
        )
      )
        errors.push("INVALID_REASON");
      return {
        line: index + 2,
        code,
        enrollment_id: student?.enrollment_id || null,
        full_name: student?.full_name || get("name"),
        raw,
        value,
        reason,
        remark: get("remark"),
        errors,
        warnings,
      };
    });
}
export async function workbook(rows: unknown[][]) {
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet("Marks");
  for (const r of rows) s.addRow(r);
  s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  s.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17344A" },
  };
  s.columns.forEach((c, i) => {
    c.width = i === 1 ? 42 : 22;
  });
  s.getColumn(1).numFmt = "@";
  return new Uint8Array((await w.xlsx.writeBuffer()) as ArrayBuffer);
}

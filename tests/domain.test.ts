import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  scoreValue,
  aggregate,
  ranks,
  fields,
  fieldErrors,
  csvCell,
} from "../lib/domain/academic";
import {
  autoMap,
  validate,
  parseFile,
  workbook,
} from "../lib/server/import-files";
const docx = (body: string) =>
  zipSync({ "word/document.xml": strToU8(body) });
describe("academic calculation contract", () => {
  it.each(["", "-", "N/A", "NA", " n/a "])(
    "preserves missing marker %s",
    (raw) => expect(scoreValue(raw, 100)).toBeNull(),
  );
  it.each(["-1", "101", "1e2", "=90", "Infinity", "9.12345", "ninety"])(
    "rejects invalid score %s",
    (raw) => expect(() => scoreValue(raw, 100)).toThrow(),
  );
  it("preserves legitimate zero", () => expect(scoreValue("0", 100)).toBe("0"));
  it("normalizes different maxima with weights using decimals", () =>
    expect(
      aggregate([
        { value: "40", maximum: "50", weight: "2" },
        { value: "90", maximum: "100", weight: "1" },
      ]),
    ).toEqual({ total: "130.0000", max_total: "150.0000", average: "83.33" }));
  it("uses half-up rounding at the hundredth", () =>
    expect(
      aggregate([{ value: "80.005", maximum: "100", weight: "1" }]).average,
    ).toBe("80.01"));
  it("assigns competition ranks without breaking ties by ID", () =>
    expect(
      ranks([
        { student_code: "003", average: "85.00" },
        { student_code: "002", average: "90.00" },
        { student_code: "001", average: "90.00" },
      ]).map((r) => [r.student_code, r.rank]),
    ).toEqual([
      ["001", 1],
      ["002", 1],
      ["003", 3],
    ]));
  it("accepts sample field layout and rejects table overflow", () => {
    expect(fieldErrors(fields)).toEqual([]);
    expect(fieldErrors(fields, 595.28, 841.89, 20)).toContain(
      "Subject table is too short.",
    );
  });
  it("detects overlapping and out-of-bounds fields", () => {
    const f = structuredClone(fields);
    f[1].y = 40;
    f[2].x = -1;
    expect(fieldErrors(f).some((x) => x.startsWith("Overlap"))).toBe(true);
    expect(fieldErrors(f).some((x) => x.startsWith("Invalid bounds"))).toBe(
      true,
    );
  });
  it.each(["=SUM(A1)", "+1", "@IMPORT", "-3", "  =FORMULA"])(
    "protects CSV formula content %s",
    (v) => expect(csvCell(v)).toBe("\"'" + v + '"'),
  );
  it("quotes CSV commas and embedded quotes", () =>
    expect(csvCell('A, "B"')).toBe('"A, ""B"""'));
});
describe("file validation", () => {
  const headers = [
    "Student ID",
    "Full Name",
    "Grade",
    "Section",
    "Score",
    "Reason",
  ];
  const roster = [
      { code: "001", full_name: "Official Name", enrollment_id: "e1" },
      { code: "002", full_name: "Second Name", enrollment_id: "e2" },
    ],
    assignment = { grade: "8", section: "A", maximum: "100" };
  it("matches by string ID despite reverse order and names", () => {
    const r = validate(
      {
        headers,
        rows: [
          ["002", "Other", "8", "A", "70", ""],
          ["001", "Official Name", "8", "A", "90", ""],
        ],
      },
      autoMap(headers),
      roster,
      assignment,
    );
    expect(r.map((r) => r.enrollment_id)).toEqual(["e2", "e1"]);
    expect(r[0].warnings).toHaveLength(1);
  });
  it("rejects duplicate unknown and wrong-section IDs", () => {
    const r = validate(
      {
        headers,
        rows: [
          ["001", "", "8", "B", "90", ""],
          ["001", "", "8", "A", "90", ""],
          ["999", "", "8", "A", "90", ""],
        ],
      },
      autoMap(headers),
      roster,
      assignment,
    );
    expect(r[0].errors).toContain("ENROLLMENT_MISMATCH: section A");
    expect(r[1].errors).toContain("DUPLICATE_ROW");
    expect(r[2].errors).toContain("STUDENT_NOT_FOUND");
  });
  it("reads a Word table and decodes entity-safe cell text", async () => {
    const t = await parseFile(
      docx(
        "<w:document><w:body><w:tbl>" +
          "<w:tr><w:tc><w:p><w:r><w:t>Student ID</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Full Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Score</w:t></w:r></w:p></w:tc></w:tr>" +
          "<w:tr><w:tc><w:p><w:r><w:t>001</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Name &amp; Surname</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>88</w:t></w:r></w:p></w:tc></w:tr>" +
          "</w:tbl></w:body></w:document>",
      ),
      "marks.docx",
    );
    expect(t.headers).toEqual(["Student ID", "Full Name", "Score"]);
    expect(t.rows[0]).toEqual(["001", "Name & Surname", "88"]);
  });
  it("keeps column alignment when Word cells are merged", async () => {
    const t = await parseFile(
      docx(
        "<w:tbl>" +
          '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Marks</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Note</w:t></w:r></w:p></w:tc></w:tr>' +
          "<w:tr><w:tc><w:p><w:r><w:t>001</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>88</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>ok</w:t></w:r></w:p></w:tc></w:tr>" +
          "</w:tbl>",
      ),
      "merged.docx",
    );
    expect(t.headers).toEqual(["Marks", "", "Note"]);
    expect(t.rows[0]).toEqual(["001", "88", "ok"]);
  });
  it("rejects documents without a table and unsupported formats", async () => {
    await expect(
      parseFile(docx("<w:document><w:body><w:p/></w:body></w:document>"), "plain.docx"),
    ).rejects.toMatchObject({ code: "NO_TABLE_FOUND" });
    await expect(
      parseFile(
        new TextEncoder().encode("Student ID,Score\n001,88"),
        "marks.csv",
      ),
    ).rejects.toMatchObject({ code: "INVALID_FILE" });
  });
  it("round trips XLSX while preserving leading zeroes", async () => {
    const t = await parseFile(
      await workbook([headers, ["001", "Official Name", "8", "A", "0", ""]]),
      "x.xlsx",
    );
    expect(t.rows[0][0]).toBe("001");
    expect(t.rows[0][4]).toBe("0");
  });
});
it("retains the missing-score dash in safe CSV exports", () =>
  expect(csvCell("-")).toBe('"-"'));

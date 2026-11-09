import Decimal from "decimal.js";
export const D = (x: Decimal.Value) => new Decimal(x);
export function scoreValue(raw: unknown, max: Decimal.Value): string | null {
  const s = String(raw ?? "").trim();
  if (["", "-", "N/A", "NA"].includes(s.toUpperCase())) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(s) || D(s).gt(max))
    throw new Error("INVALID_SCORE");
  return D(s).toFixed();
}
export function aggregate(
  marks: { value: string; maximum: string; weight: string }[],
) {
  if (!marks.length) throw new Error("No subject marks");
  let total = D(0),
    max = D(0),
    weighted = D(0),
    weights = D(0);
  for (const m of marks) {
    if (D(m.maximum).lte(0) || D(m.weight).lte(0))
      throw new Error("Invalid curriculum");
    total = total.plus(m.value);
    max = max.plus(m.maximum);
    weighted = weighted.plus(D(m.value).div(m.maximum).mul(100).mul(m.weight));
    weights = weights.plus(m.weight);
  }
  return {
    total: total.toFixed(4),
    max_total: max.toFixed(4),
    average: weighted
      .div(weights)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2),
  };
}
export function ranks<T extends { average: string; student_code: string }>(
  rows: T[],
): (T & { rank: number })[] {
  let previous = "",
    rank = 0;
  return [...rows]
    .sort(
      (a, b) =>
        D(b.average).cmp(a.average) ||
        a.student_code.localeCompare(b.student_code),
    )
    .map((r, i) => {
      if (r.average !== previous) rank = i + 1;
      previous = r.average;
      return { ...r, rank };
    });
}
export type Field = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  align: "left" | "center" | "right";
  color: string;
  overflow: "wrap" | "shrink" | "error";
  fontFamily: "sans" | "serif";
};
export const fields: Field[] = [
  ["school_name", 40, 38, 515, 35, 22],
  ["full_name", 40, 136, 515, 46, 17],
  ["student_code", 40, 200, 170, 24, 11],
  ["class", 235, 200, 140, 24, 11],
  ["term", 390, 200, 165, 24, 11],
  ["subject_table", 40, 260, 515, 320, 11],
  ["total", 40, 610, 150, 32, 14],
  ["average", 220, 610, 150, 32, 14],
  ["section_rank", 400, 610, 150, 32, 14],
  ["report_ref", 40, 752, 515, 32, 8],
].map(([key, x, y, width, height, fontSize]) => ({
  key: String(key),
  x: Number(x),
  y: Number(y),
  width: Number(width),
  height: Number(height),
  fontSize: Number(fontSize),
  align: "left",
  color: "#142A3B",
  overflow: "wrap",
  fontFamily: "sans",
}));
export const FIELD_KEYS = [
  "school_name",
  "full_name",
  "student_code",
  "class",
  "grade",
  "section",
  "year",
  "term",
  "subject_table",
  "total",
  "max_total",
  "average",
  "section_rank",
  "grade_rank",
  "issue_date",
  "approver",
  "template_revision",
  "report_ref",
];
export function fieldErrors(
  list: Field[],
  w = 595.28,
  h = 841.89,
  subjects = 3,
) {
  const errors: string[] = [];
  for (const key of [
    "full_name",
    "student_code",
    "subject_table",
    "average",
    "section_rank",
  ])
    if (!list.some((f) => f.key === key))
      errors.push(`Missing required field: ${key}`);
  const keys = new Set<string>();
  for (const f of list) {
    if (keys.has(f.key)) errors.push(`Duplicate field: ${f.key}`);
    keys.add(f.key);
    if (!FIELD_KEYS.includes(f.key)) errors.push(`Unknown field: ${f.key}`);
    if (
      [f.x, f.y, f.width, f.height, f.fontSize].some(
        (x) => !Number.isFinite(x),
      ) ||
      f.x < 0 ||
      f.y < 0 ||
      f.x + f.width > w ||
      f.y + f.height > h ||
      f.width < 20 ||
      f.height < 10 ||
      f.fontSize < 8
    )
      errors.push(`Invalid bounds or font: ${f.key}`);
    if (f.key === "subject_table" && f.height < (subjects + 1) * 28)
      errors.push("Subject table is too short.");
  }
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i],
        b = list[j];
      if (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
      )
        errors.push(`Overlap: ${a.key} / ${b.key}`);
    }
  return errors;
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (s.trim() !== "-" && /^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export const csv = (rows: unknown[][]) =>
  rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

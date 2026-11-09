import { mkdir, writeFile } from "node:fs/promises";
import { workbook } from "../../lib/server/import-files";
import { sampleName } from "../../lib/server/seed";
import { csv } from "../../lib/domain/academic";
await mkdir("sample-data/invalid", { recursive: true });
const headers = [
  "Student ID",
  "Full Name",
  "Grade",
  "Section",
  "Score",
  "Reason",
  "Remark",
];
const roster: unknown[][] = [["Student ID", "Full Name", "Grade", "Section"]];
for (const section of ["A", "B"]) {
  const size = section === "A" ? 20 : 30;
  for (let n = 1; n <= size; n++)
    roster.push([
      String((section === "A" ? 1000 : 2000) + n),
      sampleName(n, section),
      "8",
      section,
    ]);
  for (const [index, subject] of [
    "Mathematics",
    "English",
    "Science",
  ].entries()) {
    let data = Array.from({ length: size }, (_, i) => {
      const n = i + 1,
        missing = section === "A" && index === 0 && [5, 12].includes(n);
      return [
        String((section === "A" ? 1000 : 2000) + n),
        sampleName(n, section),
        "8",
        section,
        missing
          ? "-"
          : section === "B" && index === 0 && n === 15
            ? "0"
            : String(65 + ((n * 7 + index * 11) % 35)),
        missing ? (n === 5 ? "REPORTED_MISCONDUCT" : "ABSENT") : "",
        "",
      ];
    });
    if (index === 0) data = data.reverse();
    if (index === 1) data = [...data.slice(7), ...data.slice(0, 7)];
    if (index === 2)
      data = data.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    await writeFile(
      `sample-data/Grade_8${section}_${subject}.xlsx`,
      await workbook([headers, ...data]),
    );
    await writeFile(
      `sample-data/Grade_8${section}_${subject}.csv`,
      csv([headers, ...data]),
    );
    if (section === "A" && index === 0) {
      for (const type of [
        "omitted-row",
        "duplicate-id",
        "unknown-id",
        "wrong-section",
        "above-maximum",
      ]) {
        const rows = structuredClone(data);
        if (type === "omitted-row")
          rows.splice(
            rows.findIndex((r) => r[0] === "1019"),
            1,
          );
        if (type === "duplicate-id") rows.push(rows[0]);
        if (type === "unknown-id") rows[0][0] = "9999";
        if (type === "wrong-section") rows[0][3] = "B";
        if (type === "above-maximum") rows[0][4] = "101";
        await writeFile(
          "sample-data/invalid/" + type + ".xlsx",
          await workbook([headers, ...rows]),
        );
      }
    }
  }
}
await writeFile("sample-data/Student_Roster.csv", csv(roster));
await writeFile("sample-data/Student_Roster.xlsx", await workbook(roster));
console.log("Generated 19 XLSX/CSV sample fixtures.");

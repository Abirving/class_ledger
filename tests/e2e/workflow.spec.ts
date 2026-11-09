import { test, expect, Page } from "@playwright/test";
const password = process.env.E2E_PASSWORD;
test.skip(!password, "Set E2E_PASSWORD to the development seed password.");
async function login(
  page: Page,
  username: string,
  portal: "admin" | "teacher" = "teacher",
) {
  await page.goto("/login");
  await page
    .getByRole("tab", { name: portal === "admin" ? "Administrator" : "Teacher" })
    .click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page
    .getByRole("button", {
      name: portal === "admin" ? "Sign in as administrator" : "Sign in as teacher",
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Teaching assignments", exact: true }),
  ).toBeVisible();
}
test("teacher stages and submits assigned marks", async ({ page }) => {
  await login(page, "math");
  await page.goto("/upload?term=term-1&assignment=assignment-A-MATH");
  await page
    .getByLabel("Teacher marks file")
    .setInputFiles("sample-data/Grade_8A_Mathematics.xlsx");
  await page
    .getByRole("button", { name: /Continue to column mapping/ })
    .click();
  await page
    .getByRole("button", { name: "Validate marks", exact: true })
    .click();
  await expect(
    page.getByText("REPORTED_MISCONDUCT", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm & submit marks", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your marks are submitted" }),
  ).toBeVisible();
});
test("administrator reviews missing students and calculates complete B", async ({
  page,
}) => {
  await login(page, process.env.E2E_ADMIN_USERNAME || "admin", "admin");
  await page.getByRole("link", { name: "Missing marks", exact: true }).click();
  await expect(page.getByText("Abel Tesfaye", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Student ID 1005", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Results & rankings", exact: true })
    .click();
  await page.getByLabel("Section", { exact: true }).selectOption("section-B");
  await page
    .getByRole("button", { name: "Calculate results", exact: true })
    .click();
  await expect(
    page.getByText("UNOFFICIAL — NOT FOR PRINT.", { exact: false }),
  ).toBeVisible();
});
test("principal approves B and generates ZIP", async ({ page }) => {
  await login(page, process.env.E2E_ADMIN_USERNAME || "admin", "admin");
  await page
    .getByRole("link", { name: "Results & rankings", exact: true })
    .click();
  await page.getByRole("button", { name: "View results →" }).first().click();
  await page
    .getByLabel(
      "I reviewed this complete result snapshot and authorize its final approval.",
    )
    .check();
  await page.getByRole("button", { name: "Approve & lock results" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("link", { name: "Generate reports", exact: true })
    .click();
  await page.getByLabel("Select Grade 8B").check();
  await page
    .getByRole("button", { name: "Generate 30 report cards", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate reports", exact: true })
    .click();
  await expect(
    page.getByText("Section counts verified. Your report cards are ready."),
  ).toBeVisible({ timeout: 60000 });
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download ZIP", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("Report_Cards.zip");
});

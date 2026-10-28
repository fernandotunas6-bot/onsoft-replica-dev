import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const repo = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const root = path.join(repo, "reports", "finance-student-ledger") + path.sep;
await fs.mkdir(root, { recursive: true });
const fixture = path.join(repo, "scripts", "qa", "fixtures", "student-ledger", "vite.config.mjs");
const server = await createServer({ configFile: fixture });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const report = {
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  componentBlob: execFileSync(
    "git",
    ["hash-object", "src/features/finance/components/StudentLedgerPanel.tsx"],
    { cwd: repo, encoding: "utf8" },
  ).trim(),
  environment: "Chromium 140; controlled React component; fictional data; backend/session mocked",
  viewports: [],
  checks: [],
  pageErrors: [],
  blockedRequests: [],
};
async function context(width, height, mode = "") {
  const ctx = await browser.newContext({
    viewport: { width, height },
    timezoneId: "Africa/Luanda",
    reducedMotion: "reduce",
    locale: "pt-PT",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => report.pageErrors.push(e.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : (report.blockedRequests.push(route.request().url()), route.abort()),
  );
  await page.goto("http://127.0.0.1:4316/" + mode, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
try {
  for (const [w, h] of [
    [320, 800],
    [360, 800],
    [390, 844],
    [640, 360],
    [767, 900],
    [768, 1024],
    [1023, 900],
    [1024, 768],
    [1440, 1000],
  ]) {
    const { ctx, page } = await context(w, h);
    await expect(
      page.getByRole("heading", { name: "Situação financeira dos alunos" }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(25);
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    const table =
      w >= 768
        ? await page.locator("table").evaluate((el) => ({
            width: el.scrollWidth,
            containerWidth: el.parentElement.clientWidth,
            containerScroll: el.parentElement.scrollWidth,
          }))
        : null;
    if (w < 768) {
      await expect(page.getByRole("list", { name: "Lista financeira dos alunos" })).toBeVisible();
      await expect(page.locator("table")).toHaveCount(0);
    }
    const checkbox = await page.getByRole("checkbox").first().boundingBox();
    const touchTarget = await page.locator("[data-slot=student-selection]").first().boundingBox();
    expect(touchTarget.width).toBeGreaterThanOrEqual(44);
    expect(touchTarget.height).toBeGreaterThanOrEqual(44);
    expect(dimensions.documentWidth).toBeLessThanOrEqual(w + 1);
    await page.getByLabel("Curso", { exact: true }).selectOption("p2");
    await expect(page.getByRole("checkbox")).toHaveCount(23);
    await page.getByRole("button", { name: "Seleccionar página", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Limpar selecção (23)", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Desmarcar página", exact: true }).click();
    await page.getByRole("button", { name: "Limpar (1)", exact: true }).click();
    await page.evaluate(() => scrollTo(0, 0));
    if ([390, 1440].includes(w))
      await page.screenshot({ path: root + `viewport-${w}.png`, fullPage: false });
    if (w === 390) {
      await page
        .getByRole("list", { name: "Lista financeira dos alunos" })
        .locator("li")
        .first()
        .scrollIntoViewIfNeeded();
      await page
        .getByRole("list", { name: "Lista financeira dos alunos" })
        .locator("li")
        .first()
        .screenshot({ path: root + "mobile-first-card.png" });
      await page.screenshot({ path: root + "mobile-list.png", fullPage: false });
    }
    if (w === 320 || w === 640) {
      await page
        .getByRole("checkbox", { name: "Seleccionar Estudante de ensaio 05", exact: true })
        .check();
      await page.getByRole("button", { name: "Emitir propinas (1)", exact: true }).click();
      const compactDialog = page.getByRole("dialog");
      await expect(compactDialog).toBeVisible();
      const compactBounds = await compactDialog.boundingBox();
      expect(compactBounds.x).toBeGreaterThanOrEqual(0);
      expect(compactBounds.y).toBeGreaterThanOrEqual(0);
      expect(compactBounds.x + compactBounds.width).toBeLessThanOrEqual(w + 1);
      expect(compactBounds.y + compactBounds.height).toBeLessThanOrEqual(h + 1);
      await compactDialog.getByRole("button", { name: "Emitir propinas", exact: true }).focus();
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'))).toBe(
        true,
      );
      await page.keyboard.press("Escape");
      await expect(compactDialog).toHaveCount(0);
      report.checks.push(`modal ${w}x${h}: bounds, focus trap and Escape passed`);
    }
    report.viewports.push({
      w,
      h,
      ...dimensions,
      table,
      checkbox,
      touchTarget,
      filters: "passed",
      pageSelection: "passed",
    });
    await ctx.close();
  }
  const { ctx, page } = await context(390, 844);
  await page.getByLabel("Curso", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Classe", { exact: true })).toBeFocused();
  const first = page.getByRole("checkbox").first();
  await page
    .locator("[data-slot=student-selection]")
    .first()
    .click({ position: { x: 2, y: 2 } });
  await expect(first).toBeChecked();
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(first).toBeChecked();
  await page.evaluate(() => window.__changeFixtureContext("school-B", "year-2027"));
  await expect(
    page.getByRole("button", { name: "Limpar selecção (0)", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__ledgerRequests.at(-1)))
    .toMatchObject({ school: "school-B", academicYearId: "year-2027" });
  report.checks.push(
    "keyboard: filter tab order and Space selection; school/year switch resets selection and requests new context",
  );
  const debtor = page.getByRole("checkbox", {
    name: "Seleccionar Estudante de ensaio 05",
    exact: true,
  });
  await debtor.check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar cobranças (1)", exact: true }).click();
  const download = await downloadPromise;
  const csv = await fs.readFile(await download.path(), "utf8");
  expect(csv).toContain("2027/2028");
  expect(csv).toContain("0000005");
  expect(csv).not.toContain("Bento");
  report.checks.push("actual CSV download: selected debtor only, year and process correct");
  await page.getByRole("button", { name: "Emitir propinas (1)", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Vencimento", { exact: true }).fill("2026-11-10");
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  await page.screenshot({ path: root + "mobile-dialog.png", fullPage: false });
  await dialog.getByRole("button", { name: "Emitir propinas", exact: true }).dblclick();
  await expect.poll(() => page.evaluate(() => window.__issuedBatches?.length ?? 0)).toBe(1);
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("1 emitidas · 0 já existentes · 0 com erro", { exact: true }),
  ).toBeVisible();
  report.checks.push(
    "actual modal: date input, mobile boundaries and repeated click sends one controlled request; no real invoices",
  );
  await page.getByRole("link", { name: /Aluno de Ensaio com Nome/ }).click();
  await expect(page).toHaveURL(/\/faturas\?aluno=school-B-0/);
  report.checks.push("TanStack navigation: student link carries selected student id");
  await ctx.close();
  const empty = await context(360, 800, "?mode=empty");
  await expect(
    empty.page.getByText("Nenhum aluno corresponde aos filtros.", { exact: true }),
  ).toBeVisible();
  await empty.ctx.close();
  const error = await context(360, 800, "?mode=error");
  await expect(error.page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await error.page.evaluate(() => history.replaceState(history.state, "", "/"));
  await error.page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(error.page.getByRole("checkbox")).toHaveCount(25);
  await error.ctx.close();
  report.checks.push("empty and network-error/retry states");
  expect(report.pageErrors).toEqual([]);
  expect(report.blockedRequests).toEqual([]);
  report.result = "passed";
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.result = "failed";
  report.failure = error.message;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await fs.writeFile(root + "report.json", JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}

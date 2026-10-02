import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { expect } from "@playwright/test";

// Opt-in: an existing school session is supplied by its authorised owner.
// No credentials, tokens or storage state are written to the report.
const storageState = process.env.SIGA_REVIEW_STORAGE_STATE;
assert(storageState, "Defina SIGA_REVIEW_STORAGE_STATE com uma sessão Playwright autorizada.");
await access(storageState);
const baseURL = new URL(process.env.SIGA_REVIEW_URL ?? "http://127.0.0.1:3006");
assert(["http:", "https:"].includes(baseURL.protocol) && !baseURL.username && !baseURL.password);
const routes = (
  process.env.SIGA_REVIEW_ROUTES ?? "/alunos,/pedagogica,/calendario,/financeiro,/financeiro/rh"
)
  .split(",")
  .map((path) => path.trim());
assert(routes.every((path) => path.startsWith("/") && !path.startsWith("//")));
const output = fileURLToPath(new URL("../../reports/authenticated-ui-review/", import.meta.url));
await mkdir(output, { recursive: true });
const results = [];
let browser;

try {
  for (const [name, browserType] of Object.entries({ chromium, webkit })) {
    browser = await browserType.launch({
      headless: true,
      executablePath: process.env[`SIGA_REVIEW_${name.toUpperCase()}_EXECUTABLE`],
      ...(name === "chromium" ? { args: ["--no-sandbox"] } : {}),
    });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({
        storageState,
        baseURL: baseURL.origin,
        viewport,
        reducedMotion: "reduce",
      });
      // Passive review: allow authentication refresh, block application writes.
      await context.route("**/*", (route) => {
        const request = route.request();
        const authRefresh = new URL(request.url()).pathname === "/auth/v1/token";
        return ["GET", "HEAD", "OPTIONS"].includes(request.method()) || authRefresh
          ? route.continue()
          : route.abort("blockedbyclient");
      });
      const page = await context.newPage();
      for (const [index, path] of routes.entries()) {
        const errors = [];
        const onError = (error) => errors.push(error.message);
        page.on("pageerror", onError);
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page.locator("#conteudo-principal")).toBeVisible({ timeout: 30_000 });
        assert.equal(
          new URL(page.url()).pathname,
          new URL(path, baseURL).pathname,
          "Rota redireccionada: confirme sessão, papel e plano.",
        );
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const width = await page.evaluate(() => ({
          visible: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        assert(width.content <= width.visible + 1, `Overflow em ${path}`);
        assert.deepEqual(errors, [], `Erro de execução em ${path}`);
        const screenshot = `${name}-${viewport.width}-${index}.png`;
        await page.screenshot({ path: `${output}${screenshot}`, fullPage: true });
        results.push({ browser: name, path, ...viewport, status: "passed", screenshot });
        page.off("pageerror", onError);
        console.log(`${name} ${viewport.width}px ${path}: aprovado`);
      }
      await context.close();
    }
    await browser.close();
    browser = undefined;
  }
} finally {
  await browser?.close();
  await writeFile(
    `${output}results.json`,
    JSON.stringify(
      {
        baseURL: baseURL.origin,
        scope:
          "Sessão existente; navegação e leitura; sem gravações nem revisão em dispositivos físicos",
        results,
        complete: results.length === routes.length * 4,
      },
      null,
      2,
    ),
  );
}

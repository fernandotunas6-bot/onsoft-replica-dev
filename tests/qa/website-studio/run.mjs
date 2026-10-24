import assert from "node:assert/strict";
// Starts its own localhost Vite and browser in one process tree; never uses production credentials.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base = "http://127.0.0.1:3106";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "dev",
    "--config",
    "tests/qa/website-studio/vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    "3106",
    "--strictPort",
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_studio_qa",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_studio_qa",
    },
  },
);
let serverLog = "";
server.stdout.on(
  "data",
  (data) => ((serverLog += data), appendFileSync("/tmp/studio-qa-live.log", data)),
);
server.stderr.on(
  "data",
  (data) => ((serverLog += data), appendFileSync("/tmp/studio-qa-live.log", data)),
);
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if (
        (
          await fetch(base + "/tests/qa/website-studio/index.html", {
            signal: AbortSignal.timeout(2000),
          })
        ).ok
      )
        break;
    } catch {}
    if (i === 59) throw Error(serverLog);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log("Local Vite ready");
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/tests/qa/website-studio/index.html", { waitUntil: "domcontentloaded" });
  await page.getByRole("main", { name: "SIGA Website Studio" }).waitFor({ timeout: 60000 });
  await page.locator('iframe[title^="Pré-visualização privada"]').waitFor({ timeout: 30000 });
  mkdirSync("docs/qa/website-studio-2026-10-24", { recursive: true });
  await page.screenshot({ path: "docs/qa/website-studio-2026-10-24/desktop.png", fullPage: true });
  console.log("Desktop rendered with real Puck");
  const headline = page.getByLabel("Texto · O seu futuro", { exact: true });
  const start = Date.now();
  await headline.fill("Futuro na Escola");
  await page.getByText("Alterações por guardar", { exact: true }).waitFor();
  const feedbackMs = Date.now() - start;
  await page.getByRole("button", { name: "Guardar rascunho", exact: true }).click();
  await page.getByText("Rascunho guardado. A publicação mantém-se.", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.studioQA.saved().published), null);
  assert.ok(
    await page.evaluate(() =>
      Object.values(window.studioQA.saved().draft.values).includes("Futuro na Escola"),
    ),
  );
  let acceptDialogs = true;
  page.on("dialog", (dialog) => (acceptDialogs ? dialog.accept() : dialog.dismiss()));
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await page.getByText("Conteúdo publicado.", { exact: true }).waitFor();
  const revision = await page.evaluate(() => window.studioQA.saved().revision);
  await headline.fill("Edição que não se pode perder");
  await page.evaluate(() => window.studioQA.fail());
  await page.getByRole("button", { name: "Guardar rascunho", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Falha de ensaio" }).waitFor();
  assert.equal(await headline.inputValue(), "Edição que não se pode perder");
  assert.equal(await page.evaluate(() => window.studioQA.saved().revision), revision);
  acceptDialogs = false;
  await page.getByRole("link", { name: "← SIGA", exact: true }).click();
  assert.ok(await page.getByRole("main", { name: "SIGA Website Studio" }).isVisible());
  acceptDialogs = true;
  await page
    .getByRole("navigation", { name: "Seleccionar página" })
    .getByRole("button")
    .filter({ hasText: "/contactos/" })
    .click();
  await page.locator('iframe[title$="/contactos/"]').waitFor();
  await page.getByLabel("Largura da pré-visualização").selectOption("390");
  await page.getByLabel("Zoom da pré-visualização").selectOption("75");
  assert.equal(await page.evaluate(() => window.studioQA.saved().revision), revision);
  assert.equal(await page.locator("iframe").getAttribute("sandbox"), "");
  assert.equal(await page.locator("iframe").getAttribute("referrerpolicy"), "no-referrer");
  await page.getByRole("button", { name: "Aparência", exact: true }).click();
  await page.getByLabel("Cor principal", { exact: true }).fill("#123456");
  await page.waitForTimeout(400);
  assert.match(await page.frameLocator("iframe").locator("html").getAttribute("style"), /#123456/);
  const widths = [];
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width < 768) await page.getByRole("button", { name: "Propriedades", exact: true }).click();
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    assert.ok(geometry.content <= geometry.viewport + 1, JSON.stringify(geometry));
    widths.push(geometry);
    if (width === 390)
      await page.screenshot({
        path: "docs/qa/website-studio-2026-10-24/mobile.png",
        fullPage: true,
      });
  }
  assert.deepEqual(errors, []);
  const result = {
    fixtureOnly: true,
    realPuck: true,
    editedAndSaved: true,
    draftSeparatedFromPublication: true,
    failurePreservesDraft: true,
    cancelledNavigationPreservesDraft: true,
    pageSelection: true,
    widthsDoNotPublish: true,
    sandboxWithoutScripts: true,
    pageAppearancePreview: true,
    widths,
    feedbackSampleMs: feedbackMs,
    errors,
  };
  writeFileSync(
    "docs/qa/website-studio-2026-10-24/browser-results.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  writeFileSync("/tmp/studio-qa-server.log", serverLog);
}

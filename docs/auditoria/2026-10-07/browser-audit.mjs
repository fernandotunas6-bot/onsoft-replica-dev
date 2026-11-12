import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const out = "docs/auditoria/2026-10-07/evidencias";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (const [label, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ viewport });
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(u.hostname)) return route.continue();
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/", "/alunos", "/faturas", "/pedagogica", "/importar"]) {
    const started = Date.now();
    try {
      const response = await page.goto("http://127.0.0.1:3006" + path, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page
        .getByRole("button", { name: "Entrar no Portal", exact: true })
        .waitFor({ state: "visible", timeout: 30000 });
      const snapshot = await page.locator("body").innerText();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      results.push({
        label,
        path,
        status: response?.status(),
        elapsed_ms: Date.now() - started,
        url: page.url(),
        text: snapshot,
        overflow,
        errors: [...errors],
        external_requests: "blocked; no production access",
      });
      if (path === "/")
        await page.screenshot({ path: `${out}/login-${label}.png`, fullPage: true });
    } catch (e) {
      results.push({
        label,
        path,
        error: e.message,
        text: await page
          .locator("body")
          .innerText()
          .catch(() => ""),
        errors: [...errors],
      });
      if (path === "/")
        await page
          .screenshot({ path: `${out}/login-${label}.png`, fullPage: true })
          .catch(() => {});
    }
    await writeFile(`${out}/browser.json`, JSON.stringify(results, null, 2));
  }
  try {
    await page.goto("http://127.0.0.1:5174/start", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    results.push({
      label,
      path: "WEB /start",
      text: await page.locator("body").innerText(),
      overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    });
    await page.screenshot({ path: `${out}/wizard-${label}.png`, fullPage: true });
  } catch (e) {
    results.push({ label, path: "WEB /start", error: e.message });
  }
  await context.close();
}
await browser.close();
await writeFile(`${out}/browser.json`, JSON.stringify(results, null, 2));
console.log(
  JSON.stringify(
    results.map(({ text, ...r }) => ({ ...r, text: text?.slice(0, 1200) })),
    null,
    2,
  ),
);

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
  const blocked = [];
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (["localhost", "127.0.0.1"].includes(u.hostname)) return route.continue();
    blocked.push({ host: u.hostname, path: u.pathname, method: route.request().method() });
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3006/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Entrar no Portal", exact: true }).waitFor();
  await page.getByRole("button", { name: "Entrar no Portal", exact: true }).click();
  results.push({
    label,
    scenario: "login vazio",
    text: await page.locator("body").innerText(),
    validity: await page
      .locator("input")
      .evaluateAll((es) =>
        es.map((e) => ({
          type: e.type,
          required: e.required,
          valid: e.validity.valid,
          missing: e.validity.valueMissing,
        })),
      ),
    blocked: [...blocked],
  });
  await page.keyboard.press("Tab");
  results.push({
    label,
    scenario: "foco por teclado",
    focus: await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      aria: document.activeElement?.getAttribute("aria-label"),
      type: document.activeElement?.getAttribute("type"),
    })),
  });
  await page.goto("http://127.0.0.1:5174/start", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Continuar", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  results.push({
    label,
    scenario: "wizard vazio",
    text: await page.locator("body").innerText(),
    blocked: [...blocked],
  });
  await page.screenshot({ path: `${out}/wizard-validation-${label}.png`, fullPage: true });
  await context.close();
}
await browser.close();
await writeFile(`${out}/browser-interactions.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

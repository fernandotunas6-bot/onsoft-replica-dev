import { chromium } from "@playwright/test";
import * as fs from "node:fs";
import { resolve } from "node:path";

// Auditoria local, sem sessão: nunca submete formulários nem escreve na escola.
// node scripts/siga/performance-browser.mjs current reports/performance
const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Rótulo inválido.");
const output = resolve(process.argv[3] ?? "reports/performance");
fs.mkdirSync(output, { recursive: true });
let activeBrowser;

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  activeBrowser = browser;
  const runs = [];
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    for (let run = 0; run < 3; run++) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (message) => {
        if (message.type() === "error" && errors.length < 30) errors.push(message.text());
      });
      await page.addInitScript(() => {
        window.__lab = { lcp: 0, cls: 0, events: [], touchFeedback: [] };
        document.addEventListener(
          "click",
          (event) => {
            const link =
              event.target instanceof Element
                ? event.target.closest('a[aria-controls="auth-panel-content"]')
                : null;
            if (!link) return;
            const started = performance.now();
            const label = link.textContent;
            requestAnimationFrame(() =>
              window.__lab.touchFeedback.push({
                label,
                ms: performance.now() - started,
                heading: document.querySelector("#auth-panel-content h2")?.textContent,
              }),
            );
          },
          { capture: true },
        );
        for (const [type, key] of [
          ["largest-contentful-paint", "lcp"],
          ["layout-shift", "cls"],
          ["event", "events"],
        ]) {
          try {
            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) {
                if (key === "cls") {
                  if (!e.hadRecentInput) window.__lab.cls += e.value;
                } else if (key === "events")
                  window.__lab.events.push({ name: e.name, duration: e.duration });
                else window.__lab.lcp = e.startTime;
              }
            }).observe({
              type,
              buffered: true,
              ...(key === "events" ? { durationThreshold: 16 } : {}),
            });
          } catch {}
        }
      });
      await page.goto("http://localhost:3006/", { waitUntil: "domcontentloaded", timeout: 120000 });
      await page
        .getByRole("heading", { name: "Iniciar sessão", exact: true })
        .waitFor({ timeout: 60000 });
      await page.waitForFunction(() => window.__sigaVitals !== undefined, null, { timeout: 60000 });
      await page.waitForTimeout(1800);
      const geometry = await page.locator("[data-auth-panel]").boundingBox();
      const start = performance.now();
      await page.getByRole("link", { name: "Criar conta", exact: true }).click();
      await page.getByRole("heading", { name: "Criar conta SIGA Plus", exact: true }).waitFor();
      const registerMs = performance.now() - start;
      await page.getByRole("link", { name: "Iniciar sessão", exact: true }).click();
      await page.getByRole("button", { name: "Mostrar senha", exact: true }).click();
      await page.waitForTimeout(200);
      const metrics = await page.evaluate(() => ({
        ...window.__lab,
        fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
        ttfb: performance.getEntriesByType("navigation")[0]?.responseStart,
        resources: performance.getEntriesByType("resource").length,
        transferredBytes: performance
          .getEntriesByType("resource")
          .reduce((n, e) => n + e.transferSize, 0),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        activeField: document.activeElement?.id,
      }));
      if (run === 0)
        await page.screenshot({
          path: resolve(output, `${label}-${mobile ? "mobile" : "desktop"}.png`),
          fullPage: true,
        });
      runs.push({ mobile, run, geometry, registerMs, metrics, errors });
      await page.close();
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(
    resolve(output, `browser-${label}.json`),
    JSON.stringify(
      {
        kind: "local-development-lab",
        note: "Chrome isolado; sem sessão autenticada, sem throttling e sem percentis de campo. Latência do teste inclui automação; não equivale a INP.",
        runs,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      runs.map((r) => ({
        mobile: r.mobile,
        run: r.run,
        registerMs: r.registerMs,
        lcp: r.metrics.lcp,
        cls: r.metrics.cls,
        overflow: r.metrics.overflow,
        errors: r.errors,
      })),
      null,
      2,
    ),
  );
})()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await activeBrowser?.close();
  });

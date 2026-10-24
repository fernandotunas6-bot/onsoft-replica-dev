/** Isolated component QA only; no school credentials, APIs or production writes. */
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { chromium } from "@playwright/test";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const base = "9defaf17521adbdc9a46a497e5838295a42f46b6";
const qaRoot = await mkdtemp(resolve(".visual-master-qa-"));
await mkdir("docs/design/evidence/2026-10-23", { recursive: true });
await writeFile(
  resolve(qaRoot, "stacked-before.tsx"),
  execFileSync("git", ["show", `${base}:src/components/ui/stacked-modal.tsx`]),
);
await writeFile(
  resolve(qaRoot, "main.tsx"),
  await readFile("scripts/siga/visual-master/settings-fixture.tsx"),
);
await writeFile(
  resolve(qaRoot, "index.html"),
  '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
);
const server = await createServer({
  configFile: false,
  root: qaRoot,
  plugins: [react(), tailwind()],
  resolve: { alias: { "@": resolve("src") } },
  server: { host: "127.0.0.1", port: 3106, strictPort: true, fs: { allow: [resolve(".")] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
for (const width of [390, 767, 768, 1023, 1024, 1440]) {
  for (const mode of ["before", "after"]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:3106/?mode=${mode}`);
    await page.getByRole("button", { name: "Guardar", exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      scrollLocked: document.body.hasAttribute("data-scroll-locked"),
      navWidth: document.querySelector("nav")?.getBoundingClientRect().width,
      navMinTarget: Math.min(
        ...[...document.querySelectorAll("nav button")].map(
          (el) => el.getBoundingClientRect().height,
        ),
      ),
    }));
    if ([390, 1440].includes(width))
      await page.screenshot({
        path: `docs/design/evidence/2026-10-23/settings-${mode}-${width}.png`,
        fullPage: true,
      });
    if (mode === "after") {
      await page.getByRole("button", { name: "Escola", exact: true }).click();
      await page.getByText("Identidade institucional — dados de ensaio").waitFor();
    }
    results.push({ width, mode, ...metrics, errors });
    await page.close();
  }
}
await browser.close();
await server.close();
await rm(qaRoot, { recursive: true, force: true });
await writeFile(
  "docs/design/evidence/2026-10-23/component-browser.json",
  JSON.stringify(
    {
      scope:
        "Isolated shared settings component; controlled fixture, not authenticated product or physical device validation",
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
if (results.some((r) => r.errors.length || r.overflow)) process.exitCode = 1;

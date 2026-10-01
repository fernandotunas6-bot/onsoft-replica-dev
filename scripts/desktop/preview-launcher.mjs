import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const assets = {
  "/": ["index.html", "text/html"],
  "/launcher.js": ["launcher.js", "text/javascript"],
  "/launcher.css": ["launcher.css", "text/css"],
};
const server = createServer((request, response) => {
  const asset = Object.hasOwn(assets, request.url) ? assets[request.url] : null;
  if (!asset) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": asset[1],
    "Content-Security-Policy": config.app.security.csp,
  });
  response.end(readFileSync(`desktop/${asset[0]}`));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 832 },
    colorScheme: "light",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  mkdirSync("docs/desktop/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/desktop/screenshots/launcher-light.png", fullPage: true });
  await page.getByRole("button", { name: "Guia de instalação" }).click();
  await page.screenshot({
    path: "docs/desktop/screenshots/installation-guide.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  if (await page.locator("#help-dialog").evaluate((dialog) => dialog.open))
    throw new Error("Escape did not close installation guide");
  await page.getByRole("button", { name: "Guia de instalação" }).click();
  await page.getByRole("button", { name: "Entendido" }).click();
  await page.getByRole("button", { name: "Activar tema escuro" }).click();
  await page.screenshot({ path: "docs/desktop/screenshots/launcher-dark.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Activar tema claro" }).click();
  await page.screenshot({ path: "docs/desktop/screenshots/launcher-mobile.png", fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error("Horizontal overflow");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Visual checks passed: light, dark, installation guide, mobile; CSP active, no page errors or horizontal overflow.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

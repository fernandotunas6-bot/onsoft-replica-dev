#!/usr/bin/env node
/**
 * Verificação de prontidão PWA do SIGA.
 *
 * O Lighthouse 12 removeu a categoria PWA (installable-manifest, maskable-icon,
 * apple-touch-icon, splash-screen, themed-omnibox deixaram de existir como
 * auditorias). Este script substitui esse gate: falha o build quando o manifesto,
 * os ícones, o service worker ou a página offline regridem.
 *
 * Uso: node scripts/pwa-check.mjs [baseUrl]
 */

const baseUrl = (
  process.argv[2] ??
  process.env["PWA_CHECK_URL"] ??
  "http://localhost:3000"
).replace(/\/$/, "");

const failures = [];
const checks = [];

function ok(label) {
  checks.push(`✅ ${label}`);
}

function fail(label) {
  failures.push(label);
  checks.push(`❌ ${label}`);
}

async function fetchOk(path) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "follow" });
    return response;
  } catch (error) {
    return { ok: false, status: 0, statusText: String(error) };
  }
}

const html = await fetchOk("/");
let markup = "";
if (!html.ok) {
  fail(`Página inicial inacessível em ${baseUrl} (${html.status} ${html.statusText})`);
} else {
  markup = await html.text();
  ok("Página inicial responde");
}

// --- Manifesto ---------------------------------------------------------------
const manifestHref =
  markup.match(/rel="manifest"\s+href="([^"]+)"/)?.[1] ?? "/manifest.webmanifest";
if (markup && !/rel="manifest"/.test(markup)) {
  fail('HTML sem <link rel="manifest">');
}

const manifestResponse = await fetchOk(manifestHref);
let manifest = null;
if (!manifestResponse.ok) {
  fail(`Manifesto não servido em ${manifestHref} (${manifestResponse.status})`);
} else {
  try {
    manifest = JSON.parse(await manifestResponse.text());
    ok(`Manifesto válido (${manifestHref})`);
  } catch {
    fail(`Manifesto em ${manifestHref} não é JSON válido`);
  }
}

if (manifest) {
  for (const field of [
    "name",
    "short_name",
    "start_url",
    "display",
    "theme_color",
    "background_color",
  ]) {
    if (!manifest[field]) fail(`Manifesto sem campo obrigatório "${field}"`);
  }
  if (
    manifest["display"] &&
    !["standalone", "fullscreen", "minimal-ui"].includes(manifest["display"])
  ) {
    fail(`Manifesto com display "${manifest["display"]}" — não é instalável`);
  }
  const icons = Array.isArray(manifest["icons"]) ? manifest["icons"] : [];
  const sizes = new Set(icons.flatMap((icon) => String(icon.sizes ?? "").split(/\s+/)));
  for (const size of ["192x192", "512x512"]) {
    if (!sizes.has(size)) fail(`Manifesto sem ícone ${size}`);
  }
  if (!icons.some((icon) => String(icon.purpose ?? "").includes("maskable"))) {
    fail("Manifesto sem ícone maskable (ecrã inicial Android fica com moldura branca)");
  }
  for (const icon of icons) {
    if (!icon.src) continue;
    const iconResponse = await fetchOk(
      icon.src.startsWith("http") ? new URL(icon.src).pathname : icon.src,
    );
    if (!iconResponse.ok)
      fail(`Ícone do manifesto inacessível: ${icon.src} (${iconResponse.status})`);
  }
  if (icons.length > 0)
    ok(`${icons.length} ícone(s) do manifesto acessíveis e com tamanhos exigidos`);
}

// --- Ícone Apple -------------------------------------------------------------
const appleHref = markup.match(/rel="apple-touch-icon"\s+href="([^"]+)"/)?.[1];
if (!appleHref) {
  fail('HTML sem <link rel="apple-touch-icon"> (ecrã inicial iOS)');
} else {
  const appleResponse = await fetchOk(appleHref);
  if (!appleResponse.ok)
    fail(`apple-touch-icon inacessível: ${appleHref} (${appleResponse.status})`);
  else ok(`apple-touch-icon disponível (${appleHref})`);
}

// --- Viewport e cor de tema --------------------------------------------------
if (markup && !/name="viewport"/.test(markup)) fail("HTML sem meta viewport");
else if (markup) ok("Meta viewport presente");

if (markup && !/name="theme-color"/.test(markup)) fail("HTML sem meta theme-color");
else if (markup) ok("Meta theme-color presente");

// --- Service worker e offline ------------------------------------------------
const swResponse = await fetchOk("/sw.js");
if (!swResponse.ok) fail(`Service worker não servido em /sw.js (${swResponse.status})`);
else ok("Service worker servido em /sw.js");

const offlineResponse = await fetchOk("/offline.html");
if (!offlineResponse.ok)
  fail(`Página offline não servida em /offline.html (${offlineResponse.status})`);
else ok("Página offline disponível");

console.log(`\nProntidão PWA — ${baseUrl}\n`);
for (const line of checks) console.log(`  ${line}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} verificação(ões) PWA falharam:`);
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}

console.log(
  "\nPWA pronto: manifesto instalável, ícones completos, service worker e modo offline activos.\n",
);

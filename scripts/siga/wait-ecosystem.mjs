#!/usr/bin/env node
/**
 * Aguarda as 4 apps do ecossistema (portas 3006/5174/3005/5173).
 */
const targets = [
  { label: "SIGA", url: "http://localhost:3006/", ok: [200, 302] },
  { label: "WEB", url: "http://localhost:5174/", ok: [200] },
  { label: "ADMIN", url: "http://localhost:3005/", ok: [200, 307] },
  { label: "DOC", url: "http://localhost:5173/", ok: [200] },
];

const maxAttempts = Number(process.env.SIGA_E2E_WAIT_ATTEMPTS || 90);
const delayMs = Number(process.env.SIGA_E2E_WAIT_DELAY_MS || 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(target) {
  try {
    const res = await fetch(target.url, { redirect: "manual" });
    return target.ok.includes(res.status);
  } catch {
    return false;
  }
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const results = await Promise.all(
    targets.map(async (target) => ({ target, ready: await probe(target) })),
  );
  const pending = results.filter((row) => !row.ready).map((row) => row.target.label);
  if (pending.length === 0) {
    console.log("Ecossistema pronto (4 apps).");
    process.exit(0);
  }
  console.log(`[${attempt}/${maxAttempts}] A aguardar: ${pending.join(", ")}`);
  await sleep(delayMs);
}

console.error("Timeout — apps não responderam a tempo.");
process.exit(1);

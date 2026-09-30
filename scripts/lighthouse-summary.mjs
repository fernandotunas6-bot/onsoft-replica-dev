#!/usr/bin/env node
/**
 * Resumo dos relatórios do Lighthouse CI no próprio log do job.
 *
 * O `lhci assert` só imprime as asserções que falham ("performance 0.88"), sem dizer
 * porquê, e o artefacto com os relatórios nem sempre é fácil de abrir. Isto imprime,
 * por relatório: nota, FCP, LCP, TTFB, Speed Index, TBT, o elemento LCP e as fases da
 * LCP. Não muda nenhum limite nem o resultado do job.
 *
 *   node scripts/lighthouse-summary.mjs [pasta=reports/lighthouse]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "reports/lighthouse";

let files = [];
try {
  files = readdirSync(dir).filter((name) => name.endsWith(".report.json"));
} catch {
  console.log(`Sem relatórios em ${dir}.`);
  process.exit(0);
}

const ms = (audit) => (audit?.numericValue != null ? `${Math.round(audit.numericValue)} ms` : "—");

for (const name of files.sort()) {
  let lhr;
  try {
    lhr = JSON.parse(readFileSync(join(dir, name), "utf8"));
  } catch {
    continue;
  }
  const a = lhr.audits ?? {};
  const url = new URL(lhr.finalDisplayedUrl ?? lhr.requestedUrl ?? "http://x/").pathname;
  const score = lhr.categories?.performance?.score;
  const lcpDetails = a["largest-contentful-paint-element"]?.details?.items ?? [];
  const node = lcpDetails[0]?.items?.[0]?.node;
  const phases = (lcpDetails[1]?.items ?? [])
    .map((phase) => `${phase.phase} ${Math.round(phase.timing)}`)
    .join(", ");
  console.log(
    [
      `${url.padEnd(14)} perf ${score ?? "—"}`,
      `FCP ${ms(a["first-contentful-paint"])}`,
      `LCP ${ms(a["largest-contentful-paint"])}`,
      `TTFB ${ms(a["server-response-time"])}`,
      `SI ${ms(a["speed-index"])}`,
      `TBT ${ms(a["total-blocking-time"])}`,
      `LCP=${node?.nodeLabel ? `«${String(node.nodeLabel).slice(0, 40)}»` : "—"}`,
      phases ? `(${phases})` : "",
    ].join(" · "),
  );
}

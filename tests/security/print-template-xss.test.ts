import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVE_TEMPLATE_CONTENT,
  savePrintTemplateInputSchema,
} from "@/features/documents/schemas";

const base = { key: "boletim-escolar" };
const padded = (html: string) => `<div class="doc">{{school.name}}</div>${html}`;

describe("modelos de impressão sem código activo", () => {
  it.each([
    "<script>fetch('/x')</script>",
    '<img src="x" onerror="alert(1)">',
    '<a href="javascript:alert(1)">x</a>',
    '<iframe src="https://mal.example"></iframe>',
    "<svg onload=alert(1)>",
  ])("recusa %s", (html) => {
    expect(() => savePrintTemplateInputSchema.parse({ ...base, source: padded(html) })).toThrow();
  });

  it("aceita os modelos de origem do SIGA", () => {
    const dir = join(process.cwd(), "public/templates");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".hbs"))) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(ACTIVE_TEMPLATE_CONTENT.test(source), file).toBe(false);
    }
  });

  it("o iframe de impressão e a pré-visualização não deixam correr scripts", () => {
    const print = readFileSync(join(process.cwd(), "src/lib/print-html.ts"), "utf8");
    expect(print).toMatch(/setAttribute\("sandbox", "allow-same-origin allow-modals"\)/);
    const studio = readFileSync(
      join(process.cwd(), "src/features/documents/PrintTemplateStudio.tsx"),
      "utf8",
    );
    expect(studio).toMatch(/sandbox=""/);
  });

  it("na app desktop (macOS) o documento abre servido sem scripts e sem permissões da app", () => {
    const pages = readFileSync(
      join(process.cwd(), "src-tauri/src/school/internal_pages.rs"),
      "utf8",
    );
    const csp = pages.match(/pub const PRINT_CSP: &str = "([\s\S]*?)";/)?.[1] ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    // print_html abre a janela com essa política, e cada página é servida com a sua.
    const printHtml = pages.slice(pages.indexOf("pub async fn print_html"));
    expect(printHtml).toContain("PRINT_CSP.to_string()");
    expect(pages).toMatch(/\.header\("Content-Security-Policy", csp\)/);
    // As janelas de impressão ("print-…") não entram em nenhuma capability.
    const capabilityDir = join(process.cwd(), "src-tauri/capabilities");
    for (const file of readdirSync(capabilityDir).filter((name) => name.endsWith(".json"))) {
      const capability = JSON.parse(readFileSync(join(capabilityDir, file), "utf8")) as {
        windows: string[];
      };
      for (const label of capability.windows) {
        expect(["main", "school", "quick-pane"], `${file}: ${label}`).toContain(label);
      }
    }
  });
});

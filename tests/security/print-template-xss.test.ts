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
});

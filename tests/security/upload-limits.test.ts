import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeImportFileInputSchema } from "@/features/import/schemas";

describe("limites de carregamento", () => {
  it("importação recusa ficheiros acima de 25 MB antes de os ler", () => {
    expect(() =>
      analyzeImportFileInputSchema.parse({
        file_base64: "A".repeat(35_000_001),
        file_name: "x.xlsx",
      }),
    ).toThrow();
  });

  it("avatar: só PNG/JPG/WebP, até 4 MB, extensão derivada do tipo", () => {
    const source = readFileSync(join(process.cwd(), "src/features/auth/server.ts"), "utf8");
    const start = source.indexOf("export const uploadCurrentProfileAvatar ");
    const body = source.slice(start, source.indexOf("export const ", start + 1));
    expect(body).toMatch(/z\.enum\(\["image\/png", "image\/jpeg", "image\/webp"\]/);
    expect(body).toMatch(/AVATAR_EXTENSIONS\[data\.contentType\]/);
    expect(body).not.toMatch(/data\.fileName\.split/);
  });
});

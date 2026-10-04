import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_DOMAINS } from "@/features/school/settings-domains";

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".gen.ts")) out.push(path);
  }
  return out;
}

// Domínios fora do registo central, cada um com dono próprio.
const OWNED_ELSEWHERE = new Set([
  "spotlight", // spotlight/server.ts
  "teacher_contact_visibility", // people/teacher-contact-visibility.ts
  "print_templates", // documents/server.ts
]);

describe("domínios de school_settings", () => {
  it("o código só lê domínios conhecidos (um domínio inexistente lê sempre vazio)", () => {
    const known = new Set([...Object.keys(SETTINGS_DOMAINS), ...OWNED_ELSEWHERE]);
    const unknown: string[] = [];
    for (const file of walk("src")) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\.eq\("domain", "([a-z_]+)"\)/g)) {
        if (!known.has(match[1]!)) unknown.push(`${file}: ${match[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("SAF-T lê os dados fiscais da tabela schools", () => {
    const source = readFileSync("src/features/finance/server.ts", "utf8");
    const start = source.indexOf("export const exportSaftAoXml");
    const body = source.slice(start, source.indexOf("export const", start + 1));
    expect(body).toContain('.from("schools")');
    expect(body).not.toContain('.eq("domain", "school")');
  });
});

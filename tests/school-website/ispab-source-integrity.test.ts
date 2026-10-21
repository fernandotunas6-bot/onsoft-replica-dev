/**
 * Contract requested by the SIGA owner: the approved ISPAB school website
 * (all source files, assets, animations, navigation and documentation)
 * is read-only during the multi-tenant integration.
 *
 * This is NOT a pixel-parity test for /site; it checks that the original
 * template has not been modified byte-for-byte.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

type Lock = {
  files: Record<string, string>;
};

const root = process.cwd();
const locked = JSON.parse(
  readFileSync(resolve(root, "docs/school-sites/ispab-source-lock.json"), "utf8"),
) as Lock;

function gitBlobHash(bytes: Buffer): string {
  const hash = createHash("sha1");
  hash.update(`blob ${bytes.length}\0`);
  hash.update(bytes);
  return hash.digest("hex");
}

function allSourceFiles(directory: string): string[] {
  const discovered: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    // Artefactos de build, não fazem parte dos originais versionados.
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...allSourceFiles(fullPath));
    } else if (entry.isFile()) {
      discovered.push(relative(root, fullPath).split(sep).join("/"));
    }
  }
  return discovered.sort();
}

describe("ISPAB original — fidelidade absoluta dos ficheiros", () => {
  it("conserva o inventário completo: não acrescenta nem remove ficheiros", () => {
    expect(allSourceFiles(resolve(root, "painel/escolas"))).toEqual(
      Object.keys(locked.files).sort(),
    );
  });

  for (const [path, expectedHash] of Object.entries(locked.files)) {
    it(`conserva ${path} byte por byte`, () => {
      const bytes = readFileSync(resolve(root, path));
      expect(gitBlobHash(bytes)).toBe(expectedHash);
    });
  }
});

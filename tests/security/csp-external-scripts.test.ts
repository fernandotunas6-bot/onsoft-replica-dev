import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "@/lib/csp";

/**
 * Scripts que o SIGA injecta de outros domínios e a CSP que os tem de deixar passar.
 *
 * Até 11/11/2026 o hCaptcha da entrada por senha (`AuthCaptcha`) não estava na
 * política: em modo de relatório só gerava avisos, mas com a CSP obrigatória o captcha
 * não carregava e o Supabase, que o exige, recusava todas as entradas por senha.
 */
const ROOT = resolve(process.cwd());

function directive(name: string): string[] {
  const entry = CONTENT_SECURITY_POLICY.split("; ").find((part) => part.startsWith(`${name} `));
  return entry ? entry.split(" ").slice(1) : [];
}

/** Expressões de origem `https://host[/caminho]`, com `*.` no início do host. */
function allows(sources: string[], url: string): boolean {
  const target = new URL(url);
  return sources.some((source) => {
    const match = /^https:\/\/(\*\.)?([^/]+)(\/.*)?$/.exec(source);
    if (!match || target.protocol !== "https:") return false;
    const [, wildcard, host, path] = match;
    const hostOk = wildcard ? target.hostname.endsWith(`.${host}`) : target.hostname === host;
    if (!hostOk || !path) return hostOk;
    return path.endsWith("/") ? target.pathname.startsWith(path) : target.pathname === path;
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("CSP — scripts de outros domínios", () => {
  it("cada script externo que o código injecta passa no script-src", () => {
    const injected: Array<{ file: string; url: string }> = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const source = readFileSync(file, "utf8");
      if (!/createElement\(\s*["']script["']\s*\)/.test(source)) continue;
      for (const [, url] of source.matchAll(/\.src\s*=\s*["'`](https:\/\/[^"'`]+)["'`]/g)) {
        injected.push({ file: relative(ROOT, file), url });
      }
    }
    // O botão Google e o hCaptcha, pelo menos: se o teste deixar de os ver, a procura falhou.
    expect(injected.map(({ url }) => new URL(url).hostname)).toEqual(
      expect.arrayContaining(["accounts.google.com", "js.hcaptcha.com"]),
    );
    const blocked = injected.filter(({ url }) => !allows(directive("script-src"), url));
    expect(blocked).toEqual([]);
  });

  it("o hCaptcha tem tudo o que a documentação dele pede", () => {
    for (const name of ["script-src", "style-src", "frame-src", "connect-src"]) {
      expect(directive(name), name).toEqual(
        expect.arrayContaining(["https://hcaptcha.com", "https://*.hcaptcha.com"]),
      );
    }
    expect(allows(directive("frame-src"), "https://newassets.hcaptcha.com/captcha/v1/x")).toBe(
      true,
    );
    expect(allows(directive("connect-src"), "https://api.hcaptcha.com/checksiteconfig")).toBe(true);
  });

  it("o comparador de origens não deixa passar o que não deve", () => {
    expect(allows(["https://*.hcaptcha.com"], "https://hcaptcha.com.evil.example/x.js")).toBe(
      false,
    );
    expect(
      allows(["https://accounts.google.com/gsi/client"], "https://accounts.google.com/x"),
    ).toBe(false);
    expect(allows(["https://accounts.google.com/gsi/"], "https://accounts.google.com/gsi/x")).toBe(
      true,
    );
  });
});

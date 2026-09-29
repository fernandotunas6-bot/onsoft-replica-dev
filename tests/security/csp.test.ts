import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  CSP_REPORT_PATH,
  handleCspReport,
  parseCspReports,
} from "@/lib/csp";
import { SECURITY_HEADERS } from "@/lib/security-headers";

function directive(name: string) {
  const entry = CONTENT_SECURITY_POLICY.split("; ").find((part) => part.startsWith(`${name} `));
  return entry?.slice(name.length + 1) ?? "";
}

describe("Content-Security-Policy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("vai em modo de relatório, não bloqueia", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy-Report-Only"]).toBe(CONTENT_SECURITY_POLICY);
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBeUndefined();
  });

  it("fecha plugins, base, formulários e iframes de outros sites", () => {
    expect(directive("object-src")).toBe("'none'");
    expect(directive("base-uri")).toBe("'self'");
    expect(directive("form-action")).toBe("'self'");
    expect(directive("frame-ancestors")).toBe("'self'");
    expect(directive("report-uri")).toBe(CSP_REPORT_PATH);
  });

  it("deixa o browser falar com Supabase (incl. Realtime), FCM e a verificação de palavras-passe", () => {
    const connect = directive("connect-src");
    for (const origin of [
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://*.googleapis.com",
      "https://api.pwnedpasswords.com",
    ]) {
      expect(connect).toContain(origin);
    }
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
    expect(directive("style-src")).toContain("https://fonts.googleapis.com");
  });

  it("lê o formato antigo e o da Reporting API, sem query strings", () => {
    expect(
      parseCspReports({
        "csp-report": {
          "document-uri": "https://escola.portal-siga.com/app/notas?token=segredo",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js?id=1",
          "source-file": "https://escola.portal-siga.com/assets/app.js",
          "line-number": 12,
        },
      }),
    ).toEqual([
      {
        directive: "script-src-elem",
        blocked: "https://evil.example/x.js",
        page: "https://escola.portal-siga.com/app/notas",
        source: "https://escola.portal-siga.com/assets/app.js:12",
      },
    ]);
    expect(
      parseCspReports([
        {
          type: "csp-violation",
          body: {
            documentURL: "https://app.portal-siga.com/",
            effectiveDirective: "connect-src",
            blockedURL: "wss://outro.example/socket",
          },
        },
        { type: "deprecation", body: { id: "x" } },
      ]),
    ).toEqual([
      {
        directive: "connect-src",
        blocked: "wss://outro.example/socket",
        page: "https://app.portal-siga.com/",
      },
    ]);
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports({ "csp-report": { "blocked-uri": "inline" } })).toEqual([]);
  });

  it("o receptor regista e responde 204; recusa GET e corpos grandes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ok = await handleCspReport(
      new Request(`https://app.portal-siga.com${CSP_REPORT_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": { "effective-directive": "img-src", "blocked-uri": "data" },
        }),
      }),
    );
    expect(ok.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"directive":"img-src"'));

    const get = await handleCspReport(new Request(`https://app.portal-siga.com${CSP_REPORT_PATH}`));
    expect(get.status).toBe(405);

    const big = await handleCspReport(
      new Request(`https://app.portal-siga.com${CSP_REPORT_PATH}`, {
        method: "POST",
        body: "x".repeat(20 * 1024),
      }),
    );
    expect(big.status).toBe(413);

    const broken = await handleCspReport(
      new Request(`https://app.portal-siga.com${CSP_REPORT_PATH}`, {
        method: "POST",
        body: "{não é json",
      }),
    );
    expect(broken.status).toBe(204);
  });

  it("o servidor atende o receptor antes do router", () => {
    const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toContain("handleCspReport(request)");
  });
});

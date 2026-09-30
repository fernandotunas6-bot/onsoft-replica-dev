import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS, withSecurityHeaders } from "@/lib/security-headers";

describe("cabeçalhos de segurança do Worker", () => {
  it("acrescenta os cabeçalhos em falta e mantém corpo e estado", async () => {
    const response = withSecurityHeaders(
      new Response("<html></html>", { status: 201, headers: { "content-type": "text/html" } }),
    );
    expect(response.status).toBe(201);
    expect(await response.text()).toBe("<html></html>");
    expect(response.headers.get("content-type")).toBe("text/html");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("não substitui um cabeçalho que a rota já definiu", () => {
    const response = withSecurityHeaders(
      new Response("", { headers: { "X-Frame-Options": "DENY" } }),
    );
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("câmara e GPS só para o próprio SIGA; microfone desligado", () => {
    const policy = SECURITY_HEADERS["Permissions-Policy"];
    expect(policy).toContain("camera=(self)");
    expect(policy).toContain("geolocation=(self)");
    expect(policy).toContain("microphone=()");
  });

  it("o servidor aplica-os às respostas normais e à página de erro", () => {
    const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(server.match(/withSecurityHeaders\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("domínios da conta Resend da plataforma", () => {
  const source = readFileSync("src/features/saas/resend-domains-server.ts", "utf8");

  it("as três funções exigem o administrador da plataforma", () => {
    expect(
      source.match(/await requirePlatformAdmin\(context\.userId, context\.claims\["aal"\]\)/g)
        ?.length,
    ).toBe(3);
    expect(source).not.toContain("requireSgaWriter");
  });

  it("não grava o id da escola como tenant em tenant_domains", () => {
    expect(source).not.toContain('.from("tenant_domains")');
  });
});

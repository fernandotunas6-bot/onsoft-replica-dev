import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { publicSchoolSignupInputSchema } from "@/features/saas/schemas";
import { buildSignupPayload } from "../e2e/helpers/ecosystem-urls";

/**
 * O repositório é público desde 29/09. A senha dos admins criados pelos testes
 * @live na produção estava escrita no código; passou a vir de
 * E2E_LIVE_ADMIN_PASSWORD ou a ser gerada por execução.
 */
const FILES = [
  "tests/e2e/helpers/sga-live-admin.ts",
  "tests/e2e/helpers/ecosystem-urls.ts",
  "tests/e2e/enrollment-live.spec.ts",
  "scripts/siga/e2e-ecosystem-playwright.py",
];

describe("senha dos testes @live fora do código", () => {
  for (const file of FILES) {
    it(`${file} não tem a senha escrita`, () => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/E2eAdminPass/);
      expect(source).not.toMatch(/E2E_LIVE_ADMIN_PASSWORD\s*=\s*["'][^"']+["']\s*;?\s*$/m);
    });
  }

  it("a senha gerada passa as regras do registo público", () => {
    const parsed = publicSchoolSignupInputSchema.safeParse(buildSignupPayload("e2e-senha-teste"));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});

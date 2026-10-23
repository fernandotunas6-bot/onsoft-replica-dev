import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/auth/AuthGate.tsx"), "utf8");

describe("componentes de segurança carregados apenas quando necessários", () => {
  it("MFA continua obrigatório mas o diálogo não entra no JS do login comum", () => {
    expect(source).not.toContain('import { MfaChallenge } from "./MfaChallenge"');
    expect(source).toContain("const MfaChallenge = lazy(() =>");
    expect(source).toContain('import("./MfaChallenge")');
    expect(source).toContain(
      "const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()",
    );
    expect(source).toContain('assurance.data?.currentLevel !== "aal2"');
    expect(source).toContain("setMfaFactors(null)");
  });

  it("reconfirmação crítica monta apenas com sessão e mantém o diálogo", () => {
    expect(source).not.toContain('import { StepUpDialog } from "./StepUpDialog"');
    expect(source).toContain("const StepUpDialog = lazy(() =>");
    expect(source).toContain('import("./StepUpDialog")');
    expect(source).toMatch(
      /if \(session\) \{[\s\S]*?<Suspense fallback=\{null\}>[\s\S]*?<StepUpDialog/,
    );
  });

  it("mostra informação de carregamento no segundo factor sem passar autenticação", () => {
    expect(source).toContain("A preparar verificação de segurança…");
    expect(source).toMatch(/\{mfaFactors \? \([\s\S]*?<Suspense[\s\S]*?<MfaChallenge/);
  });
});

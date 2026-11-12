import { afterEach, describe, expect, it, vi } from "vitest";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
afterEach(() => {
  vi.restoreAllMocks();
});

describe("erros de banco sem dados pessoais nos logs", () => {
  it("conserva código/restrição útil sem imprimir valores nem SQL", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const message =
      'duplicate key violates constraint "people_school_email_uidx": (email)=(AUDIT-private@example.test); INSERT INTO people';
    expect(publicDatabaseError({ code: "23505", message }, "Falhou").message).toBe(
      "Já existe uma pessoa com este e-mail nesta escola.",
    );
    const output = JSON.stringify(log.mock.calls);
    expect(output).toContain("23505");
    expect(output).toContain("people_school_email_uidx");
    expect(output).not.toContain("AUDIT-private");
    expect(output).not.toContain("INSERT INTO");
  });
  it("texto de constraint/código arbitrário não passa para o log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    publicDatabaseError(
      { code: "AUDIT-secret-token", message: 'constraint "audit_secret_token"' },
      "Falha genérica",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret_token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token");
  });
});

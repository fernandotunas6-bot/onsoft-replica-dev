import { describe, expect, it } from "vitest";
import { publicErrorMessage } from "@/lib/public-error";

describe("mensagens de erro nas páginas públicas", () => {
  it("mensagens do SIGA passam", () => {
    for (const message of [
      "Este link de matrícula está fechado.",
      "Demasiadas verificações. Aguarde um minuto.",
      "O convite expirou. Solicite um novo convite ao administrador da escola.",
    ]) {
      expect(publicErrorMessage(new Error(message), "x")).toBe(message);
    }
  });

  it("mensagens técnicas dão o texto neutro", () => {
    for (const message of [
      "Missing Supabase environment variable(s): SUPABASE_URL. Connect Supabase in Lovable Cloud.",
      "PGRST204: column foo does not exist",
      "Failed to fetch",
      "Cannot read properties of undefined (reading 'id')",
      "Tabela em falta no SGA. Aplique supabase/APPLY.sql",
    ]) {
      expect(publicErrorMessage(new Error(message), "Tente mais tarde.")).toBe("Tente mais tarde.");
    }
    expect(publicErrorMessage("não é Error", "Tente mais tarde.")).toBe("Tente mais tarde.");
  });
});

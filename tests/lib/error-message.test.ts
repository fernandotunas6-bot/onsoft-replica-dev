import { describe, expect, it } from "vitest";
import { errorMessage } from "@/lib/error-message";

describe("errorMessage", () => {
  it("usa a mensagem de um Error", () => {
    expect(errorMessage(new Error("Sem ligação"), "Falhou")).toBe("Sem ligação");
  });

  it("usa a mensagem de objectos de erro que não são Error (Supabase, server functions)", () => {
    expect(errorMessage({ message: "duplicate key", code: "23505" }, "Falhou")).toBe(
      "duplicate key",
    );
  });

  it("cai no texto por omissão sem mensagem utilizável", () => {
    for (const value of [null, undefined, "texto", 42, {}, { message: "" }, { message: 7 }]) {
      expect(errorMessage(value, "Falhou")).toBe("Falhou");
    }
  });
});

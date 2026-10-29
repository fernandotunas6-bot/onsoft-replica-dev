import { describe, expect, it } from "vitest";
import { AUTH_TEMPORARILY_UNAVAILABLE, mapSignInError } from "@/features/auth/sign-in-error";

describe("mensagens de falha de autenticação", () => {
  it("reconhece HTTP 522 como indisponibilidade sem culpar as credenciais", () => {
    expect(mapSignInError({ message: "Gateway timeout", status: 522 })).toBe(
      AUTH_TEMPORARILY_UNAVAILABLE,
    );
    expect(mapSignInError({ message: "HTTP 522" })).toBe(AUTH_TEMPORARILY_UNAVAILABLE);
  });

  it("reconhece falhas de fetch e indisponibilidade da origem", () => {
    expect(mapSignInError(new TypeError("Failed to fetch"))).toBe(
      AUTH_TEMPORARILY_UNAVAILABLE,
    );
    expect(mapSignInError({ message: "Service unavailable", status: 503 })).toBe(
      AUTH_TEMPORARILY_UNAVAILABLE,
    );
  });

  it("preserva a mensagem precisa para credenciais inválidas", () => {
    expect(mapSignInError({ message: "Invalid login credentials", status: 400 })).toContain(
      "senha incorrectos",
    );
    expect(mapSignInError("invalid_credentials")).not.toBe(AUTH_TEMPORARILY_UNAVAILABLE);
  });

  it("preserva erro de limite de tentativas e de escola", () => {
    expect(mapSignInError({ message: "rate limit exceeded", status: 429 })).toContain(
      "Demasiadas tentativas",
    );
    expect(mapSignInError("school_required")).toContain("portal da sua escola");
  });

  it("não classifica erros locais desconhecidos como falha do servidor", () => {
    expect(mapSignInError(new Error("local storage unavailable"))).toBe(
      "Não foi possível iniciar sessão. Tente novamente.",
    );
    expect(mapSignInError(null)).not.toBe(AUTH_TEMPORARILY_UNAVAILABLE);
  });
});

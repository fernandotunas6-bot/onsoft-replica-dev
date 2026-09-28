import { describe, expect, it } from "vitest";
import { authRedirectError, withoutAuthRedirectError } from "@/lib/auth-redirect-error";

describe("authRedirectError", () => {
  it("reconhece a falha do Google devolvida no query", () => {
    const result = authRedirectError(
      "?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code",
      "",
    );
    expect(result?.code).toBe("unexpected_failure");
    expect(result?.message).toMatch(/conta externa/);
    // O texto do fornecedor não passa para o ecrã.
    expect(result?.message).not.toMatch(/exchange/);
  });

  it("reconhece o erro no fragmento e o cancelamento", () => {
    const result = authRedirectError(
      "",
      "#error=access_denied&error_description=The+user+denied+access",
    );
    expect(result?.message).toMatch(/cancelado/);
  });

  it("ignora URLs sem o formato do Supabase Auth", () => {
    expect(authRedirectError("?error=1", "")).toBeNull();
    expect(authRedirectError("?tab=notas", "#secao")).toBeNull();
    expect(authRedirectError("", "")).toBeNull();
  });
});

describe("withoutAuthRedirectError", () => {
  it("tira só os parâmetros de erro", () => {
    expect(
      withoutAuthRedirectError(
        "https://siga.plus/painel?tab=a&error=server_error&error_code=x&error_description=y",
      ),
    ).toBe("/painel?tab=a");
    expect(
      withoutAuthRedirectError("https://siga.plus/#error=access_denied&error_description=z"),
    ).toBe("/");
    expect(withoutAuthRedirectError("https://siga.plus/x#secao")).toBe("/x#secao");
  });
});

import { describe, expect, it } from "vitest";
import { pickUnambiguousLinkedAuthUserId } from "@/features/access/bi-identity";

describe("login por BI/telefone com identidade Auth confirmada", () => {
  it("preserva conta única ligada mesmo quando a pessoa existe em duas escolas", () => {
    expect(pickUnambiguousLinkedAuthUserId([{ user_id: "auth-1" }, { user_id: "auth-1" }])).toBe(
      "auth-1",
    );
  });

  it("recusa associação a contas Auth diferentes (BI ambíguo)", () => {
    expect(
      pickUnambiguousLinkedAuthUserId([{ user_id: "auth-1" }, { user_id: "auth-2" }]),
    ).toBeNull();
  });

  it("não usa uma ficha sem vínculo como prova de identidade", () => {
    expect(pickUnambiguousLinkedAuthUserId([{ user_id: null }])).toBeNull();
    expect(pickUnambiguousLinkedAuthUserId([])).toBeNull();
    expect(pickUnambiguousLinkedAuthUserId(null)).toBeNull();
  });

  it("ignora fichas sem vínculo quando existe apenas uma conta confirmada", () => {
    expect(pickUnambiguousLinkedAuthUserId([{ user_id: null }, { user_id: " auth-1 " }])).toBe(
      "auth-1",
    );
  });
});

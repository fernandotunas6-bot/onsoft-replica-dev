import { beforeEach, describe, expect, it, vi } from "vitest";

const sonnerError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: sonnerError }) }));

import { toastActionError } from "@/lib/action-error-toast";
import { tagErrorWithRequestId } from "@/lib/request-id";

const ID = "1a2b3c4d-0000-4000-8000-00000000abcd";

describe("aviso de erro com referência do pedido", () => {
  beforeEach(() => sonnerError.mockReset());

  it("mostra a referência curta na descrição, sem alterar o título", () => {
    const error = new Error("Esta pessoa já é encarregada deste aluno.");
    tagErrorWithRequestId(error, ID);
    toastActionError(error, "Não foi possível associar o encarregado.");
    const [title, options] = sonnerError.mock.calls[0] ?? [];
    expect(title).toBe("Esta pessoa já é encarregada deste aluno.");
    expect(String(options?.description)).toMatch(/Referência: 1A2B3C4D$/);
  });

  it("erro técnico sai com a frase do ecrã e a referência", () => {
    const error = new Error("TypeError: Failed to fetch");
    tagErrorWithRequestId(error, ID);
    toastActionError(error, "Não foi possível guardar.");
    const [, options] = sonnerError.mock.calls[0] ?? [];
    expect(String(options?.description)).toContain("Referência: 1A2B3C4D");
  });

  it("sem ID, o aviso fica como estava", () => {
    toastActionError(new Error("Esta pessoa já é encarregada deste aluno."), "x");
    const [, options] = sonnerError.mock.calls[0] ?? [];
    expect(String(options?.description ?? "")).not.toContain("Referência");
  });
});

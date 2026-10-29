import { describe, expect, it } from "vitest";
import {
  validatePersonQuickEdit,
  validateTeacherQuickForm,
} from "@/features/people/quick-form-validation";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";

describe("validação inline dos formulários de Pessoas", () => {
  it("rejeita nome curto e e-mail inválido antes de criar professor", () => {
    const errors = validateTeacherQuickForm({
      nome: "A",
      email: "email-invalido",
      telefone: "",
    });
    expect(errors["nome"]).toBeTruthy();
    expect(errors["email"]).toBeTruthy();
  });

  it("aceita professor com nome, e-mail e telefone válidos", () => {
    expect(
      validateTeacherQuickForm({
        nome: "Ana António",
        email: "ana@escola.ao",
        telefone: "923111222",
      }),
    ).toEqual({});
  });

  it("rejeita contacto telefónico inválido sem enviar mutação", () => {
    expect(
      validateTeacherQuickForm({ nome: "Ana António", telefone: "12" })["telefone"],
    ).toBeTruthy();
  });

  it("na edição de pessoa aponta BI/NIF e nome para os campos correctos", () => {
    const errors = validatePersonQuickEdit(
      { nome: "A", email: "errado", telefone: "12", nif: "INVALID" },
      PERSON_ID,
    );
    expect(errors["nome"]).toBeTruthy();
    expect(errors["email"]).toBeTruthy();
    expect(errors["telefone"]).toBeTruthy();
    expect(errors["nif"]).toBeTruthy();
  });

  it("preserva campos opcionais vazios e aceita BI válido na edição", () => {
    expect(
      validatePersonQuickEdit(
        {
          nome: "Ana António",
          email: "",
          telefone: "",
          nif: "000204688CA010",
        },
        PERSON_ID,
      ),
    ).toEqual({});
  });
});

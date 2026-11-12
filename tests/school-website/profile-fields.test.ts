/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/dom";
// @ts-expect-error Public website intentionally uses native browser modules.
import * as fields from "../../painel/escolas/src/profile-fields.mjs";
const {
  applicationPhoneError,
  setupApplicationProfile,
  setupFieldFeedback,
  refreshApplicationHints,
} = fields;
beforeEach(() => {
  document.body.innerHTML =
    '<form id="application-form"><label>Nome<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Motivação<textarea name="motivation" maxlength="100"></textarea></label></form>';
});
afterEach(() => {
  document.body.innerHTML = "";
});
describe("perfil e ajuda nos campos", () => {
  it.each(["", "923456789", "+244 923 456 789", "244222333444", "(222) 333 444"])(
    "aceita telefone opcional ou de Angola: %s",
    (value) => {
      expect(applicationPhoneError(value)).toBe("");
    },
  );
  it.each(["+55 11 99999-9999", "244123", "923456789abc"])(
    "explica um telefone inválido: %s",
    (value) => {
      expect(applicationPhoneError(value)).toMatch(/9 algarismos/);
    },
  );
  it("acrescenta campos opcionais uma única vez e mantém os campos antigos", () => {
    const form = document.querySelector("form")!;
    setupApplicationProfile(form);
    setupApplicationProfile(form);
    expect(form.querySelectorAll("[name=phone]")).toHaveLength(1);
    expect((form.elements.namedItem("phone") as HTMLInputElement).required).toBe(false);
    expect((form.elements.namedItem("education") as HTMLSelectElement).required).toBe(false);
    expect(form.querySelector("textarea")?.maxLength).toBe(100);
    expect(form.querySelector("[name=name]")).toBeTruthy();
  });
  it("associa erros ao campo e limpa o erro imediatamente após uma correcção", () => {
    const form = document.querySelector("form")!;
    setupFieldFeedback(form);
    setupFieldFeedback(form);
    const input = form.elements.namedItem("name") as HTMLInputElement;
    input.setCustomValidity("Preencha este campo.");
    fireEvent.blur(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(input.id + "-feedback");
    fireEvent.input(input, { target: { value: "Ana Exemplo" } });
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.checkValidity()).toBe(true);
    const text = form.querySelector("textarea")!;
    fireEvent.input(text, { target: { value: "Teste" } });
    expect(form.querySelector("[data-counter-for]")?.textContent).toBe("5 / 100 caracteres");
    input.setCustomValidity("Antigo");
    refreshApplicationHints(form, true);
    expect(input.checkValidity()).toBe(true);
    expect(form.querySelectorAll(".academic-field-feedback")).toHaveLength(3);
  });
});

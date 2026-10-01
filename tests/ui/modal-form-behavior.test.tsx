/** @vitest-environment jsdom */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ModalFooter, FormModal } from "@/components/ui/modal-system";
import { Input } from "@/components/ui/input";

afterEach(cleanup);

describe("Submissão dos modais", () => {
  it("respeita campos obrigatórios e submete uma única vez", () => {
    const submit = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input aria-label="Nome obrigatório" required />
        <ModalFooter onSubmit={submit} submitLabel="Guardar" />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Aluno exemplo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("mantém a acção dos rodapés fora de formulário", () => {
    const submit = vi.fn();
    render(<ModalFooter onSubmit={submit} submitLabel="Confirmar" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("identifica o modal pelo título e impede nova submissão enquanto guarda", () => {
    const submit = vi.fn();
    render(
      <FormModal open onOpenChange={vi.fn()} title="Nova matrícula" onSubmit={submit} isSubmitting>
        <Input aria-label="Nome" />
      </FormModal>,
    );
    expect(screen.getByRole("dialog", { name: "Nova matrícula" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fechar" }).getAttribute("aria-label")).toBe(
      "Fechar",
    );
  });
});

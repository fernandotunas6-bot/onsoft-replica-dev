import * as React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { Root } from "@radix-ui/react-dialog";
import { ModalHeader, ModalFooter, ModalContent } from "@/components/ui/modal-system";

describe("Unified Modal System Subcomponents", () => {
  it("renders ModalHeader cleanly", () => {
    const html = renderToString(
      React.createElement(
        Root,
        null,
        React.createElement(ModalHeader, {
          title: "Criar Matrícula de Aluno",
          subtitle: "Ano Letivo 2026",
        }),
      ),
    );
    expect(html).toContain("Criar Matrícula de Aluno");
    expect(html).toContain("Ano Letivo 2026");
  });

  it("renders ModalFooter with submit and cancel buttons", () => {
    const html = renderToString(
      React.createElement(ModalFooter, {
        onCancel: () => {},
        onSubmit: () => {},
        cancelLabel: "Cancelar Operação",
        submitLabel: "Confirmar Matrícula",
        isSubmitting: false,
      }),
    );
    expect(html).toContain("Cancelar Operação");
    expect(html).toContain("Confirmar Matrícula");
  });

  it("renders ModalContent container with padding", () => {
    const html = renderToString(
      React.createElement(
        ModalContent,
        null,
        React.createElement("div", null, "Dados Pessoais do Estudante"),
      ),
    );
    expect(html).toContain("Dados Pessoais do Estudante");
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { splitDescription } from "@/lib/split-description";
import { MoreInfo } from "@/components/ui/more-info";
import { InlineLoading } from "@/components/ui/inline-loading";

describe("texto mais leve", () => {
  it("descrições curtas ficam inteiras", () => {
    expect(splitDescription("Alunos e turmas.")).toEqual({ lead: "Alunos e turmas.", rest: "" });
  });

  it("descrições longas mostram a primeira frase e guardam o resto", () => {
    const text =
      "Gestão das turmas da escola. Aqui define horários, professores, disciplinas e salas para cada ano lectivo.";
    const { lead, rest } = splitDescription(text);
    expect(lead).toBe("Gestão das turmas da escola.");
    expect(rest).toMatch(/^Aqui define horários/);
  });

  it("uma frase única longa não é cortada", () => {
    const text = "x".repeat(150);
    expect(splitDescription(text)).toEqual({ lead: text, rest: "" });
  });

  it("'Saber mais' mostra e esconde o detalhe", () => {
    render(<MoreInfo>Detalhe escondido</MoreInfo>);
    expect(screen.queryByText("Detalhe escondido")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Saber mais" }));
    expect(screen.getByText("Detalhe escondido")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar menos" }));
    expect(screen.queryByText("Detalhe escondido")).toBeNull();
  });

  it("o carregamento é anunciado sem ocupar o ecrã", () => {
    render(<InlineLoading label="A carregar pedidos…" />);
    expect(screen.getByRole("status").textContent).toBe("A carregar pedidos…");
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { IdentifierValue } from "@/components/ui/identifier-value";

/** O texto que se copia: sem o rótulo só para leitores de ecrã. */
const copied = (el: HTMLElement) =>
  [...el.querySelectorAll("span")]
    .filter((s) => !s.classList.contains("select-none") && !s.children.length)
    .map((s) => s.textContent)
    .join("");

describe("número de aluno nas listas", () => {
  it("1 + ano + 4 dígitos: dois grupos à vista, um número ao copiar", () => {
    const { container } = render(<IdentifierValue value="1260042" />);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.title).toBe("Nº de aluno 1260042 · série de 2026");
    expect(chip.getAttribute("translate")).toBe("no");
    expect(copied(chip)).toBe("1260042");
    expect(chip.textContent).toContain("Nº de aluno");
    expect(chip.className).toContain("tabular-nums");
  });

  it("outros formatos aparecem tal como são", () => {
    const { container } = render(<IdentifierValue value="FT-0001" kind="document" />);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.title).toBe("Nº do documento FT-0001");
    expect(copied(chip)).toBe("FT-0001");
  });

  it("sem número: traço, e o leitor de ecrã sabe de quê", () => {
    const { container } = render(<IdentifierValue value={null} kind="enrollment" />);
    expect(container.textContent).toBe("Nº de matrícula: —");
  });

  it("texto de substituição sem algarismos conta como vazio", () => {
    const { container } = render(<IdentifierValue value="Sem processo" />);
    expect(container.textContent).toBe("Nº de aluno: —");
    const { container: hidden } = render(<IdentifierValue value={null} emptyLabel="" />);
    expect(hidden.innerHTML).toBe("");
  });

  it("com rótulo visível e sem moldura", () => {
    const { container } = render(<IdentifierValue value="1250001" showLabel variant="plain" />);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.className).not.toContain("border");
    expect(chip.textContent).toBe("Nº de aluno1250001");
  });
});

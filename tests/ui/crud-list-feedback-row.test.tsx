// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Table, TableBody } from "@/components/ui/table";
import {
  CrudListFeedbackRow,
  type CrudListFeedbackRowProps,
} from "@/components/ui/crud-list-feedback-row";

afterEach(cleanup);

function show(props: Partial<CrudListFeedbackRowProps> = {}) {
  const defaults: CrudListFeedbackRowProps = {
    colSpan: 4,
    kind: "empty",
    entityLabel: "pessoas",
  };
  return render(
    <Table>
      <TableBody>
        <CrudListFeedbackRow {...defaults} {...props} />
      </TableBody>
    </Table>,
  );
}

describe("CrudListFeedbackRow", () => {
  it("distingue a lista realmente vazia de erro, com colspan correcto", () => {
    show();
    expect(screen.getByText("Ainda não existem pessoas")).toBeTruthy();
    expect(screen.getByRole("cell").getAttribute("colspan")).toBe("4");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("mostra filtros sem resultados e permite limpá-los", () => {
    const onClearFilters = vi.fn();
    show({ kind: "filtered", onClearFilters });
    expect(screen.getByText("Nenhum resultado para os filtros aplicados")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it("apresenta um erro recuperável sem imprimir detalhes internos", () => {
    const onRetry = vi.fn();
    show({ kind: "error", entityLabel: "professores", onRetry });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Não foi possível carregar professores");
    expect(alert.textContent).not.toContain("SQL");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("não oferece retry num estado sem autorização", () => {
    show({ kind: "forbidden" });
    expect(screen.getByText("Não tem permissão para consultar estes registos.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("distingue o conflito de concorrência de indisponibilidade", () => {
    const onRetry = vi.fn();
    show({ kind: "conflict", onRetry });
    expect(screen.getByRole("alert").textContent).toContain("foram alterados");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar listagem" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

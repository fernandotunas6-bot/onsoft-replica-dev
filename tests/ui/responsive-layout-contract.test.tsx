// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTableShell } from "@/components/ui/data-table-shell";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

afterEach(cleanup);

describe("cabeçalhos do SIGA em ecrãs estreitos", () => {
  it("mantém títulos longos e acções dentro da largura disponível", () => {
    render(
      <PageHeader
        group="Académico"
        title="Relatórios e resultados académicos consolidados"
        description="Resultados oficiais das turmas com filtros e acções institucionais."
        hideBreadcrumb
        actions={<button type="button">Exportar relatório</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 }).className).toContain("break-words");
    const action = screen.getByRole("button", { name: "Exportar relatório" });
    expect(action.parentElement?.className).toContain("w-full");
    expect(action.parentElement?.className).toContain("flex-wrap");
  });

  it("mantém o caminho navegável sem forçar múltiplas linhas no telemóvel", () => {
    render(
      <PageHeader
        group="Pedagógica"
        title="Avaliação da turma"
        description="Resumo do período."
      />,
    );
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb.className).toContain("overflow-x-auto");
    expect(breadcrumb.querySelector("ol")?.className).toContain("flex-nowrap");
    expect(screen.getByRole("link", { name: "Início" }).getAttribute("href")).toBe("/");
  });
});

describe("tabelas responsivas", () => {
  it("preserva cabeçalho e rodapé e permite foco no conteúdo deslocável", () => {
    render(
      <DataTableShell header={<span>Alunos</span>} footer={<span>10 resultados</span>}>
        <table><tbody><tr><td>Aluno A</td></tr></tbody></table>
      </DataTableShell>,
    );
    const region = screen.getByRole("region", { name: "Tabela com deslocação horizontal" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("overflow-x-auto");
    expect(region.className).toContain("focus-visible:ring-2");
    expect(screen.getByText("Alunos")).toBeTruthy();
    expect(screen.getByText("10 resultados")).toBeTruthy();
  });
});

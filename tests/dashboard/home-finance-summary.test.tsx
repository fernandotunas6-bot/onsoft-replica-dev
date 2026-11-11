// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdminFinanceSummary } from "@/features/dashboard/components/AdminFinanceSummary";

afterEach(cleanup);

describe("Resumo financeiro do Início", () => {
  it("mostra valores fornecidos pelo overview sem recalcular pagamentos", () => {
    render(
      <AdminFinanceSummary
        loading={false}
        finance={{ billed: 100000, received: 65000, outstanding: 35000, overdue: 10000 }}
      />,
    );
    const section = screen.getByRole("region", { name: "Resumo financeiro" });
    expect(section.textContent).toContain("Recebido");
    expect(section.textContent).toContain("Facturado");
    expect(section.textContent).toContain("Por receber");
    expect(section.textContent).toContain("Em atraso");
    expect(section.textContent).not.toContain("Ainda não estão disponíveis");
  });

  it("usa valores indisponíveis em vez de zeros inventados", () => {
    render(<AdminFinanceSummary finance={null} loading={false} />);
    expect(screen.getByText(/Ainda não estão disponíveis indicadores financeiros/)).toBeDefined();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("não indica montantes definitivos enquanto carrega", () => {
    render(<AdminFinanceSummary finance={null} loading />);
    expect(screen.getAllByText("…")).toHaveLength(4);
    expect(screen.queryByText("Ainda não estão disponíveis indicadores financeiros")).toBeNull();
  });
});

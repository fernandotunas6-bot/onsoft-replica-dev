// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdminAuditActivity } from "@/features/dashboard/components/AdminAuditActivity";

afterEach(cleanup);

describe("Auditoria no Início administrativo", () => {
  it("apresenta somente as operações recebidas da lista de auditoria", () => {
    render(
      <AdminAuditActivity
        loading={false}
        unavailable={false}
        items={[
          {
            id: "audit-11",
            title: "Actualizou matrícula",
            detail: "enrollment.update",
            time: "27/10/2026",
          },
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "Actividade registada" })).toBeDefined();
    expect(screen.getByText("Actualizou matrícula")).toBeDefined();
    expect(screen.getByText("enrollment.update")).toBeDefined();
    expect(screen.getByText("27/10/2026")).toBeDefined();
    expect(screen.queryByText("100%")).toBeNull();
  });

  it("mostra um estado vazio verificável sem declarar eficiência ou saúde do sistema", () => {
    render(<AdminAuditActivity items={[]} loading={false} unavailable={false} />);
    expect(screen.getByText("Nenhum registo de auditoria disponível.")).toBeDefined();
    expect(screen.queryByText("Operacional")).toBeNull();
  });

  it("distingue indisponibilidade de ausência de ocorrências", () => {
    render(<AdminAuditActivity items={[]} loading={false} unavailable />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível consultar a auditoria",
    );
    expect(screen.queryByText("Nenhum registo de auditoria disponível.")).toBeNull();
  });
});

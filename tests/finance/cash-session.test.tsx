// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderRoute } from "../routes/_harness";
import type { CashSessionState } from "@/features/finance/cash-session.functions";

vi.setConfig({ testTimeout: 20_000 });

const stateMock = vi.fn<() => Promise<CashSessionState>>();
vi.mock("@/features/finance/cash-session.functions", () => ({
  getCashSessionState: () => stateMock(),
  openCashSession: vi.fn(),
  closeCashSession: vi.fn(),
  approveCashDifference: vi.fn(),
  listCashSessionReports: vi.fn(async () => []),
  recordCashDeposit: vi.fn(),
  reverseCashDeposit: vi.fn(),
  confirmCashDeposit: vi.fn(),
}));

const { CashSessionBar, CashDifferencesPanel, CashDepositsPanel } =
  await import("@/features/finance/components/CashSession");

afterEach(() => {
  cleanup();
  stateMock.mockReset();
});

const base = {
  available: true as const,
  enforceFrom: "2999-01-01",
  session: null,
  pending: [],
  canApprove: true,
  deposits: [],
};

describe("barra do caixa", () => {
  it("sem a migração aplicada não mostra nada", async () => {
    stateMock.mockResolvedValue({ available: false });
    const { container } = renderRoute(() => <CashSessionBar />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe("");
  });

  it("caixa fechado em transição avisa da data e oferece abrir", async () => {
    stateMock.mockResolvedValue(base);
    renderRoute(() => <CashSessionBar />);
    expect(await screen.findByText("Caixa fechado")).toBeTruthy();
    expect(screen.getByText(/ainda entram sem caixa aberto; depois, são recusados/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir caixa" })).toBeTruthy();
  });

  it("depois da data diz que o numerário precisa do caixa aberto", async () => {
    stateMock.mockResolvedValue({ ...base, enforceFrom: "2000-01-01" });
    renderRoute(() => <CashSessionBar />);
    expect(await screen.findByText(/precisam do caixa aberto/)).toBeTruthy();
  });

  it("caixa aberto mostra o esperado e oferece fechar", async () => {
    stateMock.mockResolvedValue({
      ...base,
      session: {
        id: "11111111-1111-4111-8111-111111111111",
        openedAt: "2026-10-24T08:00:00Z",
        openedBy: "u1",
        openingFloat: 5000,
        expectedCash: 17500,
        openedByMe: true,
      },
    });
    renderRoute(() => <CashSessionBar />);
    expect(await screen.findByText(/Caixa aberto desde/)).toBeTruthy();
    expect(screen.getByText(/17\s?500/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fechar caixa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Depositar no banco" })).toBeTruthy();
  });
});

describe("depósitos por confirmar", () => {
  const deposit = {
    id: "33333333-3333-4333-8333-333333333333",
    amount: 8000,
    reference: "TAL-0001",
    depositedAt: "2026-10-25T10:00:00Z",
    depositedByMe: false,
    inOpenSession: true,
  };

  it("outra pessoa confirma no extracto; o da sessão aberta anula-se", async () => {
    stateMock.mockResolvedValue({ ...base, deposits: [deposit] });
    renderRoute(() => <CashDepositsPanel />);
    expect(await screen.findByText(/TAL-0001/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar no extracto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anular" })).toBeTruthy();
  });

  it("quem depositou não vê o botão de confirmar", async () => {
    stateMock.mockResolvedValue({
      ...base,
      deposits: [{ ...deposit, depositedByMe: true, inOpenSession: false }],
    });
    renderRoute(() => <CashDepositsPanel />);
    expect(await screen.findByText(/confirma outra pessoa/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar no extracto" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
  });
});

describe("diferenças por aprovar", () => {
  const pending = {
    id: "22222222-2222-4222-8222-222222222222",
    closedAt: "2026-10-23T18:00:00Z",
    closedBy: "u1",
    difference: -500,
    reason: "Troco a mais",
  };

  it("quem fechou não vê o botão de aprovar", async () => {
    stateMock.mockResolvedValue({ ...base, pending: [{ ...pending, closedByMe: true }] });
    renderRoute(() => <CashDifferencesPanel />);
    expect(await screen.findByText(/aprova outro Administrador/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
  });

  it("outro Administrador pode aprovar", async () => {
    stateMock.mockResolvedValue({ ...base, pending: [{ ...pending, closedByMe: false }] });
    renderRoute(() => <CashDifferencesPanel />);
    expect(await screen.findByRole("button", { name: "Aprovar" })).toBeTruthy();
    expect(screen.getByText("falta")).toBeTruthy();
  });
});

describe("migração das sessões de caixa", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261024110000_finance_cash_sessions.sql"),
    "utf8",
  );

  it("uma sessão aberta por posto, e um posto activo por escola", () => {
    expect(sql).toMatch(/UNIQUE INDEX finance_cash_sessions_one_open[\s\S]+?WHERE status = 'open'/);
    expect(sql).toMatch(/UNIQUE INDEX finance_cash_points_one_active[\s\S]+?WHERE active/);
  });

  it("quem fechou não aprova, na base e na função", () => {
    expect(sql).toMatch(/approved_by IS DISTINCT FROM closed_by/);
    expect(sql).toMatch(/Quem fechou o caixa não pode aprovar a diferença/);
  });

  it("diferença diferente de zero exige motivo", () => {
    expect(sql).toMatch(/difference = 0 OR length\(btrim\(coalesce\(difference_reason/);
  });

  it("o movimento partilha a sessão e o fecho tranca-a: nada entra depois do esperado", () => {
    expect(sql).toMatch(/for share of s/);
    const fecho = sql.slice(sql.indexOf("CREATE FUNCTION private.close_cash_session"));
    expect(fecho.indexOf("for update")).toBeLessThan(fecho.indexOf("cash_session_expected("));
  });

  it("tabelas e funções nascem fechadas ao anon", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON public\.finance_cash_points FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON public\.finance_cash_sessions FROM PUBLIC, anon, authenticated/,
    );
    const criadas = [...sql.matchAll(/CREATE FUNCTION (\w+\.\w+)\(/g)].map((m) => m[1]);
    for (const fn of criadas) {
      expect(sql, `${fn} sem REVOKE`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION ${fn.replace(".", "\\.")}\\(`),
      );
    }
  });

  it("depósitos no banco: saem do esperado, talão único, quem deposita não confirma", () => {
    expect(sql).toMatch(
      /- coalesce\(\(select sum\(d\.amount\) from public\.finance_cash_deposits d[\s\S]+?d\.status = 'posted'\), 0\)/,
    );
    expect(sql).toMatch(
      /UNIQUE INDEX finance_cash_deposits_one_reference[\s\S]+?WHERE status = 'posted'/,
    );
    expect(sql).toMatch(/confirmed_by IS NULL OR confirmed_by IS DISTINCT FROM deposited_by/);
    expect(sql).toMatch(/O depósito é maior do que o numerário na gaveta/);
    expect(sql).toMatch(
      /REVOKE ALL ON public\.finance_cash_deposits FROM PUBLIC, anon, authenticated/,
    );
  });

  it("recibos do gateway, com external_id, não passam pela gaveta", () => {
    expect(sql).toMatch(/if NEW\.external_id is not null then\s+return NEW;/);
    expect(sql).toMatch(/if OLD\.external_id is not null then\s+return NEW;/);
  });

  it("despesa por aprovar só sai da gaveta quando é aprovada", () => {
    expect(sql).toMatch(/if NEW\.status = 'pending_approval' then\s+return NEW;/);
    expect(sql).toMatch(
      /OLD\.status = 'pending_approval' then\s+if NEW\.status = 'posted' and OLD\.method = 'cash' and NEW\.cash_session_id is null then\s+NEW\.cash_session_id := private\.cash_session_or_refuse/,
    );
  });
});

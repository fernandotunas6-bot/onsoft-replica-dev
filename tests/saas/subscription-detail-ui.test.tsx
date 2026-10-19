// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DEFAULT_BILLING } from "@/features/saas/billing-periods";
import type { SubscriptionOverview } from "@/features/saas/subscription-server";

const renewal = vi.hoisted(() => vi.fn(async () => ({ ok: true, periodEnd: "" })));

vi.mock("@/features/saas/subscription-server", () => ({
  getMySubscription: vi.fn(),
  requestPlanChange: vi.fn(),
  cancelPlanChangeRequest: vi.fn(),
  startPlanPayment: vi.fn(),
  submitPlanPaymentProof: vi.fn(),
  setSubscriptionRenewal: renewal,
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => ({}),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/auth/use-current-account", () => ({ useCurrentAccount: () => ({}) }));

const plan = (code: string, name: string, monthly: number) => ({
  id: code,
  code,
  name,
  description: "",
  max_students: 250,
  max_staff: 25,
  max_storage_gb: 5,
  price_aoa_monthly: monthly,
  price_aoa_yearly: monthly * 10,
  features: { academic: true, finance: true, attendance: true, documents: true },
  is_active: true,
});

function overview(patch: Partial<SubscriptionOverview> = {}): SubscriptionOverview {
  const plans = [plan("start", "Start", 50_000), plan("professional", "Professional", 120_000)];
  return {
    tenantId: "t1",
    schoolName: "Colégio Teste",
    slug: "teste",
    status: "active",
    subscriptionStatus: "active",
    trialEndsAt: null,
    periodEnd: "2026-11-30T00:00:00Z",
    periodStart: "2026-10-30T00:00:00Z",
    plan: plans[1] as never,
    usage: { students: 10, staff: 2, storageBytes: 0, calculatedAt: null },
    limits: { students: 750, staff: 75, storageGb: 20 },
    domains: [],
    subdomain: "teste.portal-siga.com",
    plans: plans as never,
    pendingPlanRequest: null,
    billingPeriod: "monthly",
    cancelAtPeriodEnd: false,
    billing: DEFAULT_BILLING,
    billingWaived: false,
    billingExempt: false,
    ...patch,
  };
}

async function renderDetail(data: SubscriptionOverview) {
  const { SubscriptionDetail } = await import("@/routes/configuracoes_.assinatura");
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SubscriptionDetail data={data} />
    </QueryClientProvider>,
  );
}

describe("assinatura ao estilo Claude", () => {
  afterEach(cleanup);

  it("mostra a próxima cobrança e sugere passar a anual com a poupança", async () => {
    await renderDetail(overview());
    expect(screen.getByText(/Próxima cobrança a/)).toBeTruthy();
    expect(screen.getByText(/Pague anualmente e poupe/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mudar para anual" }));
    // A comparação passa a mostrar o total anual com a poupança.
    expect(screen.getAllByText(/cobrado anualmente/).length).toBeGreaterThan(0);
  });

  it("cancelar a renovação pede confirmação e mantém o acesso até ao fim", async () => {
    await renderDetail(overview());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar renovação" }));
    expect(screen.getByText(/Mantém o acesso a tudo até/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar renovação" })[0]!);
    await vi.waitFor(() => expect(renewal).toHaveBeenCalledWith({ data: { renew: false } }));
  });

  it("com renovação cancelada oferece retomar", async () => {
    await renderDetail(overview({ cancelAtPeriodEnd: true }));
    expect(screen.getByText(/A assinatura termina a/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retomar a assinatura" })).toBeTruthy();
  });

  it("escola isenta não vê pagamento nem preços", async () => {
    await renderDetail(overview({ billingWaived: true, billingExempt: true }));
    expect(screen.getByText(/está isenta de pagamento/)).toBeTruthy();
    expect(screen.queryByText(/Gerar referência/)).toBeNull();
    expect(screen.queryByText(/Pague anualmente/)).toBeNull();
  });

  it("«Ver mais» abre o que o pacote inclui", async () => {
    await renderDetail(overview());
    fireEvent.click(screen.getAllByRole("button", { name: /Ver mais/ })[0]!);
    expect(screen.getByText(/Ideal para:/)).toBeTruthy();
    expect(screen.getByText("Secretaria")).toBeTruthy();
  });
});

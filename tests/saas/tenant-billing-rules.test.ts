import { describe, expect, it } from "vitest";
import {
  billingSchedule,
  billingStateOf,
  computeTenantCharge,
  defaultBillingProfile,
  exemptReasonOf,
  nextDueDate,
  publicReviewReadiness,
  tenantBillingProfileInputSchema,
  PUBLIC_SCHOOL_REQUIREMENTS,
} from "@/features/saas/tenant-billing-rules";
import { getTenantAccessBlock } from "@/features/saas/tenant-access";

const NOW = new Date("2026-10-15T12:00:00Z");
const base = () => defaultBillingProfile("t1");
const PLAN = { price_aoa_monthly: 50_000, price_aoa_yearly: 500_000 };

describe("computeTenantCharge", () => {
  it("tabela do plano, mensal", () => {
    const c = computeTenantCharge({ profile: base(), plan: PLAN, activeStudents: 120 });
    expect(c.total).toBe(50_000);
    expect(c.months).toBe(1);
  });

  it("plano anual usa o preço anual de tabela, sem desconto em cima", () => {
    const c = computeTenantCharge({
      profile: { ...base(), billingPeriod: "yearly" },
      plan: PLAN,
      activeStudents: 0,
    });
    expect(c.total).toBe(500_000);
    expect(c.periodDiscount).toBe(0);
  });

  it("por aluno, com mínimo facturável e desconto trimestral", () => {
    const c = computeTenantCharge({
      profile: {
        ...base(),
        pricingModel: "per_student",
        pricePerStudentAoa: 300,
        minBillableStudents: 100,
        billingPeriod: "quarterly",
      },
      plan: PLAN,
      activeStudents: 40,
    });
    expect(c.billedStudents).toBe(100);
    expect(c.monthlyBase).toBe(30_000);
    expect(c.gross).toBe(90_000);
    expect(c.periodDiscount).toBe(4_500); // 5 %
    expect(c.total).toBe(85_500);
  });

  it("acima do mínimo conta os alunos reais; desconto da plataforma configurável", () => {
    const c = computeTenantCharge({
      profile: {
        ...base(),
        pricingModel: "per_student",
        pricePerStudentAoa: 250,
        minBillableStudents: 100,
        billingPeriod: "semiannual",
        discountPct: 10,
      },
      plan: null,
      activeStudents: 400,
      periodDiscounts: { semiannual: 8 },
    });
    expect(c.billedStudents).toBe(400);
    expect(c.gross).toBe(600_000);
    expect(c.periodDiscount).toBe(48_000);
    expect(c.customDiscount).toBe(55_200);
    expect(c.total).toBe(496_800);
  });

  it("valor fixo negociado", () => {
    const c = computeTenantCharge({
      profile: {
        ...base(),
        pricingModel: "fixed",
        fixedAmountAoa: 75_000,
        billingPeriod: "monthly",
      },
      plan: PLAN,
      activeStudents: 999,
    });
    expect(c.total).toBe(75_000);
  });

  it("pausada ou isenta não paga", () => {
    const state = billingStateOf(
      { ...base(), billingPaused: true, billingPausedReason: "Acordo com o MED" },
      NOW,
    );
    const c = computeTenantCharge({ profile: base(), plan: PLAN, activeStudents: 10, state });
    expect(c.total).toBe(0);
    expect(c.chargeable).toBe(false);
  });
});

describe("billingStateOf", () => {
  it("por omissão cobra", () => {
    expect(billingStateOf(base(), NOW).mode).toBe("charging");
  });

  it("pausa com data acaba no fim do dia indicado", () => {
    const paused = {
      ...base(),
      billingPaused: true,
      billingPausedReason: "Obras",
      billingPausedUntil: "2026-10-15",
    };
    expect(billingStateOf(paused, NOW).mode).toBe("paused");
    expect(billingStateOf(paused, new Date("2026-10-16T00:30:00Z")).mode).toBe("charging");
  });

  it("pausa sem data dura até ser retomada", () => {
    const paused = { ...base(), billingPaused: true, billingPausedReason: "Em revisão" };
    expect(billingStateOf(paused, new Date("2030-01-01")).charging).toBe(false);
  });

  it("escola pública só fica isenta depois de aprovada", () => {
    const pub = { ...base(), institutionType: "public" as const };
    expect(billingStateOf({ ...pub, publicReviewStatus: "pending" }, NOW).charging).toBe(true);
    const approved = billingStateOf({ ...pub, publicReviewStatus: "approved" }, NOW);
    expect(approved.mode).toBe("exempt");
    expect(exemptReasonOf(approved)).toBe("Escola pública (isenta do plano)");
  });

  it("a razão gravada no tenant diz porquê e até quando", () => {
    const s = billingStateOf(
      {
        ...base(),
        billingPaused: true,
        billingPausedReason: "Calamidade",
        billingPausedUntil: "2026-12-31",
      },
      NOW,
    );
    expect(exemptReasonOf(s)).toBe("Cobranças pausadas até 2026-12-31: Calamidade");
    expect(exemptReasonOf(billingStateOf(base(), NOW))).toBeNull();
  });
});

describe("prazos", () => {
  it("próximo vencimento no dia escolhido", () => {
    expect(nextDueDate(NOW, 20)).toBe("2026-10-20");
    expect(nextDueDate(NOW, 15)).toBe("2026-10-15");
    expect(nextDueDate(NOW, 5)).toBe("2026-11-05");
    expect(nextDueDate(new Date("2026-12-20T00:00:00Z"), 10)).toBe("2027-01-10");
  });

  it("emissão, vencimento e suspensão", () => {
    expect(
      billingSchedule({ dueDay: 10, paymentTermsDays: 15, graceDays: 7, autoSuspend: true }, NOW),
    ).toEqual({ issueOn: "2026-10-26", dueOn: "2026-11-10", suspendAfter: "2026-11-17" });
    expect(
      billingSchedule({ dueDay: 10, paymentTermsDays: 0, graceDays: 7, autoSuspend: false }, NOW)
        .suspendAfter,
    ).toBeNull();
  });
});

describe("escola pública", () => {
  it("não aprova sem os requisitos obrigatórios", () => {
    const r = publicReviewReadiness({ ...base(), institutionType: "public" });
    expect(r.canApprove).toBe(false);
    expect(r.missing).toContain("Código ou número oficial da escola.");
    expect(r.missing).toContain("Acordo de tratamento de dados assinado");
  });

  it("aprova com os obrigatórios; os recomendados só avisam", () => {
    const requirements = Object.fromEntries(
      PUBLIC_SCHOOL_REQUIREMENTS.filter((r) => r.required).map((r) => [r.id, true]),
    );
    const r = publicReviewReadiness({
      ...base(),
      institutionType: "public",
      publicRequirements: requirements,
      publicOfficialCode: "LDA-0123",
      publicSupervisingBody: "Direcção Municipal da Educação de Viana",
    });
    expect(r.canApprove).toBe(true);
    expect(r.recommendedMissing.length).toBeGreaterThan(0);
  });

  it("uma privada nunca é aprovada como pública", () => {
    expect(publicReviewReadiness(base()).canApprove).toBe(false);
  });
});

describe("validação do perfil", () => {
  const valid = {
    institutionType: "private",
    pricingModel: "plan",
    billingPeriod: "monthly",
    dueDay: 10,
    paymentTermsDays: 15,
    graceDays: 7,
    autoSuspend: true,
    paymentMethods: ["bank_transfer"],
    invoiceByEmail: true,
  };

  it("aceita o mínimo e normaliza vazios", () => {
    const parsed = tenantBillingProfileInputSchema.parse({
      ...valid,
      billingEmail: "",
      billingNif: " ",
    });
    expect(parsed.billingEmail).toBeNull();
    expect(parsed.billingNif).toBeNull();
  });

  it("recusa por aluno sem valor, dia 31 e nenhum modo de pagamento", () => {
    expect(
      tenantBillingProfileInputSchema.safeParse({ ...valid, pricingModel: "per_student" }).success,
    ).toBe(false);
    expect(tenantBillingProfileInputSchema.safeParse({ ...valid, dueDay: 31 }).success).toBe(false);
    expect(
      tenantBillingProfileInputSchema.safeParse({ ...valid, paymentMethods: [] }).success,
    ).toBe(false);
  });
});

describe("acesso de escola isenta ou pausada", () => {
  const expired = {
    status: "active" as const,
    subscription_status: "trialing" as const,
    trial_ends_at: "2026-10-01T00:00:00Z",
  };

  it("trial terminado bloqueia quem é cobrado", () => {
    expect(getTenantAccessBlock(expired, NOW).blocked).toBe(true);
  });

  it("sem cobrança, trial terminado e atraso não bloqueiam", () => {
    expect(getTenantAccessBlock({ ...expired, billing_exempt: true }, NOW).blocked).toBe(false);
    expect(
      getTenantAccessBlock(
        { status: "past_due", subscription_status: "unpaid", billing_exempt: true },
        NOW,
      ).blocked,
    ).toBe(false);
  });

  it("suspensão e cancelamento manuais continuam a bloquear", () => {
    expect(getTenantAccessBlock({ status: "suspended", billing_exempt: true }, NOW).blocked).toBe(
      true,
    );
    expect(getTenantAccessBlock({ status: "archived", billing_exempt: true }, NOW).blocked).toBe(
      true,
    );
  });
});

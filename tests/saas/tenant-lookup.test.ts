import { describe, expect, it } from "vitest";
import { publicTenantSummary, checkSlugAvailability } from "@/features/saas/tenant-lookup";
import type { Tenant } from "@/features/saas/types";

describe("publicTenantSummary", () => {
  it("expõe apenas campos públicos do tenant", () => {
    const tenant = {
      id: "ten-1",
      name: "Escola Teste",
      slug: "escola-teste",
      status: "active",
      subscription_status: "trialing",
      trial_ends_at: "2026-12-01T00:00:00.000Z",
      max_students: 500,
      max_storage_gb: 10,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    } satisfies Tenant;

    expect(publicTenantSummary(tenant)).toEqual({
      id: "ten-1",
      name: "Escola Teste",
      slug: "escola-teste",
      status: "active",
      subscription_status: "trialing",
      trial_ends_at: "2026-12-01T00:00:00.000Z",
    });
  });
});

describe("checkSlugAvailability", () => {
  it("rejeita slugs curtos ou inválidos com reason=invalid", async () => {
    const res = await checkSlugAvailability("ab");
    expect(res.available).toBe(false);
    expect(res.reason).toBe("invalid");
  });

  it("rejeita slugs reservados com reason=reserved", async () => {
    const res = await checkSlugAvailability("admin");
    expect(res.available).toBe(false);
    expect(res.reason).toBe("reserved");
  });

  it("aceita slug bem formatado e não-reservado", async () => {
    const res = await checkSlugAvailability("colegio-esperanca");
    expect(res.slug).toBe("colegio-esperanca");
    expect(typeof res.available).toBe("boolean");
  });
});

import { describe, expect, it } from "vitest";
import { publicSchoolSignupInputSchema } from "@/features/saas/schemas";

const base = {
  name: "Colégio Esperança",
  nif: "5417123456",
  contact_name: "Maria Canguele",
  contact_email: "maria@example.ao",
  plan_code: "professional",
  slug: "colegio-esperanca",
  admin_email: "maria@example.ao",
  admin_name: "Maria Canguele",
  admin_password: "Esperanca2026x",
};

describe("registo público: localização e natureza da escola", () => {
  it("aceita e normaliza província, município, comuna, bairro e natureza", () => {
    const parsed = publicSchoolSignupInputSchema.parse({
      ...base,
      province: "huila",
      municipality: "Lubango",
      commune: "Arimba",
      neighborhood: "Lalula",
      school_type: "confessional",
    });
    expect(parsed).toMatchObject({
      province: "Huíla",
      municipality: "Lubango",
      commune: "Arimba",
      neighborhood: "Lalula",
      school_type: "confessional",
    });
  });

  it("ignora província e natureza desconhecidas em vez de recusar o registo", () => {
    const parsed = publicSchoolSignupInputSchema.parse({
      ...base,
      province: "Atlântida",
      school_type: "espacial",
    });
    expect(parsed.province).toBeUndefined();
    expect(parsed.school_type).toBeUndefined();
  });
});

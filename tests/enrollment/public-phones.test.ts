import { describe, expect, it } from "vitest";
import { submitPublicEnrollmentInputSchema } from "@/features/enrollment/schemas";

const base = { slug: "escola-matricula", person: { full_name: "Ana Silva" } };
const parse = (extra: Record<string, unknown>, person: Record<string, unknown> = {}) =>
  submitPublicEnrollmentInputSchema.safeParse({
    ...base,
    ...extra,
    person: { ...base.person, ...person },
  });

describe("telefones da candidatura pública", () => {
  it("aceita números de Angola e internacionais, e campos vazios", () => {
    expect(
      parse({ guardianPhone: "923 000 000" }, { phone_primary: "+244 912 345 678" }).success,
    ).toBe(true);
    expect(parse({ guardianPhone: "+351 912 345 678" }).success).toBe(true);
    expect(parse({ guardianPhone: "" }, { phone_primary: "" }).success).toBe(true);
    // Parênteses e espaços normalizam-se (+244923000000).
    expect(parse({ guardianPhone: "(923) 000 000" }).success).toBe(true);
  });

  it.each(["923000000 / 912000000", "ligar depois"])(
    "recusa %s no envio (a base recusava-o só ao aceitar)",
    (phone) => {
      const guardian = parse({ guardianPhone: phone });
      expect(guardian.success).toBe(false);
      const candidate = parse({}, { phone_primary: phone });
      expect(candidate.success).toBe(false);
    },
  );
});

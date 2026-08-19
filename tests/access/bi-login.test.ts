import { describe, expect, it } from "vitest";
import { resolveBiToEmailInputSchema } from "@/features/access/bi-login";
import { validateAngolaBi } from "@/lib/angola-identity";

describe("BI Login Resolution Tests", () => {
  it("validates BI login input schema", () => {
    const parsed = resolveBiToEmailInputSchema.parse({
      identifier: "004212984LA042",
    });
    expect(parsed.identifier).toBe("004212984LA042");
  });

  it("validates Angola BI format before querying DB", () => {
    const validBi = validateAngolaBi("004212984LA042");
    expect(validBi.ok).toBe(true);
    expect(validBi.compact).toBe("004212984LA042");

    const invalidBi = validateAngolaBi("12345");
    expect(invalidBi.ok).toBe(false);
  });
});

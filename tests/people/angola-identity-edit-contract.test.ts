import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Pessoa edit flows use AngolaIdentityField for BI/NIF", () => {
  it("the /pessoas quick edit form declares the nif field as angola-identity", () => {
    const route = source("src/routes/pessoas/index.tsx");
    const nifFieldMatch = route.match(/name:\s*"nif"[\s\S]{0,120}/);

    expect(nifFieldMatch).not.toBeNull();
    expect(nifFieldMatch?.[0]).toContain('type: "angola-identity"');
  });

  it("a ficha da pessoa (/pessoas/$personId) renders AngolaIdentityField instead of a plain Input for BI/NIF", () => {
    const modal = source("src/routes/pessoas/$personId.tsx");

    expect(modal).toContain(
      'import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField"',
    );
    expect(modal).toMatch(/BI \/ NIF[\s\S]{0,60}<AngolaIdentityField/);
  });
});

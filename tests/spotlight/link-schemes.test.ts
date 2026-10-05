import { describe, expect, it } from "vitest";
import { spotlightLinkSchema } from "@/features/spotlight/schemas";

describe("links dos destaques", () => {
  it("aceita https e caminhos internos", () => {
    expect(
      spotlightLinkSchema.safeParse({ type: "external", href: "https://siga.ao" }).success,
    ).toBe(true);
    expect(spotlightLinkSchema.safeParse({ type: "internal", to: "/faturas" }).success).toBe(true);
  });

  it("recusa javascript:, data: e caminhos para outro domínio", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://x.ao/f"]) {
      expect(spotlightLinkSchema.safeParse({ type: "external", href }).success).toBe(false);
    }
    for (const to of ["//evil.example", "javascript:alert(1)", "faturas", "/\\evil.example"]) {
      expect(spotlightLinkSchema.safeParse({ type: "internal", to }).success).toBe(false);
    }
  });
});

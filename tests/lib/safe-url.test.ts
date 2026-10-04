import { describe, expect, it } from "vitest";
import { nullableHttpUrlSchema, optionalHttpUrlSchema, safeHref } from "@/lib/safe-url";

describe("links guardados por utilizadores", () => {
  it("safeHref só devolve http(s)", () => {
    expect(safeHref("https://chat.whatsapp.com/abc")).toBe("https://chat.whatsapp.com/abc");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
  });

  it("os formulários recusam javascript: e completam o https", () => {
    expect(optionalHttpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(optionalHttpUrlSchema.parse("chat.whatsapp.com/abc")).toBe(
      "https://chat.whatsapp.com/abc",
    );
    expect(optionalHttpUrlSchema.parse("  ")).toBeUndefined();
    expect(nullableHttpUrlSchema.safeParse("JavaScript:alert(1)").success).toBe(false);
    expect(nullableHttpUrlSchema.parse("")).toBeNull();
    expect(nullableHttpUrlSchema.parse("https://linkedin.com/in/x")).toBe(
      "https://linkedin.com/in/x",
    );
  });
});

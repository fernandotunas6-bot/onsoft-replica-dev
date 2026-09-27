import { describe, expect, it } from "vitest";
import { safeNotificationHref } from "@/features/notifications/personal";

describe("destino do aviso", () => {
  it("aceita caminhos internos simples", () => {
    expect(safeNotificationHref({ href: "/acessos" })).toBe("/acessos");
    expect(safeNotificationHref({ href: "/" })).toBe("/");
  });

  it("recusa outros domínios, esquemas e lixo", () => {
    for (const href of [
      "//evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/a?x=<",
      "acessos",
    ]) {
      expect(safeNotificationHref({ href })).toBeNull();
    }
    expect(safeNotificationHref(null)).toBeNull();
    expect(safeNotificationHref({ href: 3 })).toBeNull();
  });
});

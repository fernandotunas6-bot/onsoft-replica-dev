import { describe, expect, it } from "vitest";
import { listDispatchesInputSchema } from "@/features/communications/dispatches-server";

describe("Communication Dispatches Schemas", () => {
  it("valida valores padrão e opções de filtro de despachos", () => {
    const empty = listDispatchesInputSchema.parse({});
    expect(empty.channel).toBe("all");
    expect(empty.status).toBe("all");
    expect(empty.limit).toBe(50);

    const filtered = listDispatchesInputSchema.parse({
      channel: "email",
      status: "delivered",
      limit: 20,
    });
    expect(filtered.channel).toBe("email");
    expect(filtered.status).toBe("delivered");
    expect(filtered.limit).toBe(20);
  });

  it("rejeita canais ou status inválidos", () => {
    expect(() =>
      listDispatchesInputSchema.parse({
        channel: "telegram",
      }),
    ).toThrow();

    expect(() =>
      listDispatchesInputSchema.parse({
        status: "unknown_status",
      }),
    ).toThrow();
  });
});

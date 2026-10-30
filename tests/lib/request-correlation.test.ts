import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentRequestId, installRequestIdSource } from "@/lib/execution-context";
import { logSigaEvent } from "@/lib/ops-report";
import {
  acceptRequestId,
  newRequestId,
  requestReferenceOf,
  tagErrorWithRequestId,
} from "@/lib/request-id";

const ID = "1a2b3c4d-0000-4000-8000-00000000abcd";

describe("identificador de correlação", () => {
  afterEach(() => {
    installRequestIdSource(() => null);
    vi.restoreAllMocks();
  });

  it("só aceita do browser um UUID; texto livre não entra nos logs", () => {
    expect(acceptRequestId(ID.toUpperCase())).toBe(ID);
    expect(acceptRequestId(" Ana Silva ")).toBeNull();
    expect(acceptRequestId("1a2b3c4d")).toBeNull();
    expect(acceptRequestId(null)).toBeNull();
    expect(acceptRequestId(newRequestId())).not.toBeNull();
  });

  it("liga o ID ao erro sem mudar a mensagem e dá a referência curta", () => {
    const error = new Error("Esta pessoa já é encarregada deste aluno.");
    tagErrorWithRequestId(error, ID);
    expect(error.message).toBe("Esta pessoa já é encarregada deste aluno.");
    expect(requestReferenceOf(error)).toBe("1A2B3C4D");
    expect(Object.keys(error)).not.toContain("correlationId");
    expect(requestReferenceOf(new Error("x"))).toBeUndefined();
    expect(requestReferenceOf("texto")).toBeUndefined();
    expect(() => tagErrorWithRequestId(Object.freeze(new Error("x")), ID)).not.toThrow();
  });

  it("o log do servidor leva o ID do pedido em curso, e nada quando não há pedido", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logSigaEvent("teste.evento", { school_id: "s1" });
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).not.toHaveProperty("request_id");

    installRequestIdSource(() => ID);
    expect(currentRequestId()).toBe(ID);
    logSigaEvent("teste.evento", { school_id: "s1" });
    expect(JSON.parse(String(info.mock.calls[1]?.[0]))).toMatchObject({
      request_id: ID,
      school_id: "s1",
    });
  });

  it("uma fonte que falha não derruba o log", () => {
    installRequestIdSource(() => {
      throw new Error("fora de um pedido");
    });
    expect(currentRequestId()).toBeNull();
  });

  it("o Worker instala a fonte e o browser envia o ID em cada server function", () => {
    const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toMatch(/installRequestIdSource\(/);
    expect(server).toMatch(/x-request-id/);
    const start = readFileSync(join(process.cwd(), "src/start.ts"), "utf8");
    expect(start).toMatch(/functionMiddleware: \[attachSupabaseAuth, correlateServerFn\]/);
  });
});

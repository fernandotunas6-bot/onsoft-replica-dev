import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { InstitutionalDocuments } from "../src/components/InstitutionalDocuments";
import { parseStudentDocuments, type StudentDocuments } from "../src/domain/documents";
import type { Context, Gateway } from "../src/domain/model";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ctx: Context = { userId: id(1), schoolId: id(2), role: "aluno" };
const req = (n: number, extra: Partial<StudentDocuments["requests"][number]> = {}) => ({
  id: id(n),
  document: `Documento ${n}`,
  status: "submitted" as const,
  details: null,
  requestedAt: "2026-10-05T10:00:00+00:00",
  updatedAt: "2026-10-05T10:00:00+00:00",
  ...extra,
});
const data = (
  requests = [
    req(10),
    req(11, { status: "approved", updatedAt: "2026-10-08T09:00:00+00:00" }),
    req(12, { status: "fulfilled" }),
  ],
): StudentDocuments => ({
  schoolId: ctx.schoolId,
  userId: ctx.userId,
  role: "aluno",
  requests,
  available: [{ name: "Declaração de matrícula", kind: "declaration" }],
});
afterEach(cleanup);

describe("contrato dos documentos", () => {
  it("aceita só a resposta deste aluno, nesta escola", () => {
    expect(parseStudentDocuments(data(), ctx).requests).toHaveLength(3);
    for (const bad of [
      { ...data(), userId: id(9) },
      { ...data(), schoolId: id(9) },
      { ...data(), role: "professor" },
      data([req(10, { status: "lost" as never })]),
      data([req(10), req(10)]),
      data([{ ...req(10), reviewNote: "x" } as never]),
      { ...data(), available: [{ name: "x", kind: "boletim" }] },
    ])
      expect(() => parseStudentDocuments(bad, ctx)).toThrow();
    expect(() => parseStudentDocuments(data(), { ...ctx, role: "professor" })).toThrow();
  });
});

describe("página dos documentos", () => {
  const gateway = (studentDocuments: Gateway["studentDocuments"]): Gateway => ({
    session: async () => null,
    workspace: async () => {
      throw Error("unused");
    },
    execute: async () => {},
    signOut: async () => {},
    studentDocuments,
  });
  it("separa os pedidos em curso dos concluídos e diz quando levantar", async () => {
    render(
      <InstitutionalDocuments ctx={ctx} gateway={gateway(vi.fn().mockResolvedValue(data()))} />,
    );
    const ongoing = await screen.findByRole("region", { name: "Em curso" });
    expect(within(ongoing).getByText("Pronto a levantar")).toBeTruthy();
    expect(within(ongoing).getByText(/Levante-o na secretaria/)).toBeTruthy();
    expect(within(ongoing).getByText("Recebido")).toBeTruthy();
    const done = screen.getByRole("region", { name: "Concluídos" });
    expect(within(done).getByText("Entregue")).toBeTruthy();
    expect(screen.getByText("Declaração de matrícula")).toBeTruthy();
    expect(screen.getByText(/Dirija-se à secretaria/)).toBeTruthy();
  });
  it("sem pedidos diz isso, e um erro aparece tal como veio", async () => {
    render(
      <InstitutionalDocuments ctx={ctx} gateway={gateway(vi.fn().mockResolvedValue(data([])))} />,
    );
    expect(await screen.findByText(/Ainda não tem pedidos de documentos/)).toBeTruthy();
    cleanup();
    render(
      <InstitutionalDocuments
        ctx={ctx}
        gateway={gateway(vi.fn().mockRejectedValue(new Error("Falhou.")))}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toBe("Falhou.");
  });
});

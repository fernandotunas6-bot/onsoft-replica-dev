import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { updateClassGroupInputSchema } from "@/features/academic/schemas";

/**
 * Auditoria 13: «Reactivar turma» só envia o estado. Antes o servidor repunha a
 * lotação em 30, o turno caía em «manhã» e o grupo de WhatsApp era apagado.
 */
describe("actualizar uma turma", () => {
  const base = { id: "3f1d2a40-1111-4111-8111-111111111111", code: "10-A", name: "10.ª A" };

  it("turno, lotação e WhatsApp ausentes ficam ausentes (não mexem)", () => {
    const parsed = updateClassGroupInputSchema.parse({ ...base, status: "active" });
    expect(parsed.shift).toBeUndefined();
    expect(parsed.capacity).toBeUndefined();
    expect(parsed.whatsappInviteUrl).toBeUndefined();
    expect(parsed.whatsappGroupName).toBeUndefined();
  });

  it("apagar o WhatsApp no formulário chega como null", () => {
    const parsed = updateClassGroupInputSchema.parse({
      ...base,
      whatsappInviteUrl: null,
      whatsappGroupName: "",
    });
    expect(parsed.whatsappInviteUrl).toBeNull();
    expect(parsed.whatsappGroupName).toBeNull();
  });

  it("o servidor só grava o que veio e não baixa a lotação abaixo dos alunos", () => {
    const source = readFileSync("src/features/academic/server-legacy.ts", "utf8");
    const start = source.indexOf("export const updateClassGroup");
    const body = source.slice(start, source.indexOf("export const", start + 1));
    expect(body).not.toContain("capacity: data.capacity ?? 30");
    expect(body).not.toContain("whatsapp_invite_url: data.whatsappInviteUrl ?? null");
    expect(body).toContain('.in("status", ["pending", "active"])');
    expect(body).toMatch(/a lotação não pode ficar em/);
  });

  it("«Reactivar» envia só o estado", () => {
    const modal = readFileSync("src/features/academic/components/TurmaProfileModal.tsx", "utf8");
    const reactivate = modal.slice(modal.indexOf("setReactivating(true)"));
    const call = reactivate.slice(0, reactivate.indexOf("});"));
    expect(call).not.toContain("capacity:");
    expect(call).not.toContain("shift:");
    expect(call).toContain('status: "active"');
  });
});

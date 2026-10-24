import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/enrollment/server.ts", "utf8");
const decide = source.slice(source.indexOf("export const decideEnrollmentApplication"));
const at = (needle: string) => {
  const index = decide.indexOf(needle);
  expect(index, needle).toBeGreaterThan(-1);
  return index;
};

describe("aceitar candidatura: sem alunos duplicados nem pessoas órfãs", () => {
  it("exige 2FA antes de qualquer escrita", () => {
    expect(at("requireAal2(context.claims")).toBeLessThan(at('.from("enrollment_applications")'));
    expect(at("requireAal2(context.claims")).toBeLessThan(at('.from("people")'));
  });

  it("reserva a candidatura (pendente e sem reserva activa) antes de criar a pessoa", () => {
    const claim = at(
      ".update({ decided_at: claimedAt.toISOString(), decided_by: context.userId })",
    );
    expect(claim).toBeLessThan(at(".insert(personPayload)"));
    expect(decide).toContain("decided_at.is.null,decided_at.lt.");
  });

  it("valida a turma (activa, ano activo, data, lotação) antes de criar o aluno", () => {
    expect(at("assertClassAcceptsEnrollment(db")).toBeLessThan(at(".insert(personPayload)"));
  });

  it("reaproveita a pessoa do mesmo BI e recusa um segundo aluno", () => {
    expect(at('.eq("national_id", normalizedNif)')).toBeLessThan(at(".insert(personPayload)"));
    expect(decide).toContain("Já existe um aluno com este BI");
  });

  it("erro ao criar o encarregado já não é ignorado", () => {
    expect(decide).toContain('"Não foi possível registar o encarregado."');
  });

  it("se o aluno não nasce, desfaz as pessoas novas e liberta a candidatura", () => {
    const recovery = decide.slice(decide.indexOf("} catch (error) {"));
    expect(recovery.indexOf("discardCreatedPeople()")).toBeGreaterThan(-1);
    expect(recovery.indexOf("releaseClaim()")).toBeGreaterThan(-1);
  });

  it("marca a candidatura aceite antes de colocar na turma", () => {
    expect(at('decision: "accepted",')).toBeLessThan(at("enrollStudentRpc(context.supabase"));
  });

  it("só quem reservou fecha a candidatura", () => {
    const mark = source.slice(source.indexOf("async function markApplicationDecided"));
    expect(mark).toContain('.eq("status", "pending")');
    expect(mark).toContain('.eq("decided_by", input.userId)');
  });
});

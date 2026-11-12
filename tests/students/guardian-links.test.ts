import { describe, expect, it } from "vitest";
import {
  closeGuardianLink,
  linkGuardian,
  reopenSurvivorGuardianLinks,
} from "@/features/students/guardian-links";
import { memoryDb } from "./memory-db";

const SCHOOL = "escola-a";
const STUDENT = "aluno-1";
const GUARDIAN = "pessoa-mae";

function link(overrides: Record<string, unknown> = {}) {
  return {
    id: "vinculo-1",
    school_id: SCHOOL,
    student_id: STUDENT,
    guardian_person_id: GUARDIAN,
    relationship: "mother",
    is_primary: true,
    valid_from: "2025-09-01",
    valid_until: null,
    ...overrides,
  };
}

const ids = { schoolId: SCHOOL, studentId: STUDENT, guardianPersonId: GUARDIAN };

describe("vínculo aluno–encarregado com vigência", () => {
  it("remover fecha a vigência sem apagar e deixa de ser principal", async () => {
    const store = memoryDb({ student_guardians: [link()] });
    const closed = await closeGuardianLink(store.db, { ...ids, today: "2026-10-29" });
    expect(closed).toEqual({
      id: "vinculo-1",
      wasPrimary: true,
      relationship: "mother",
      validFrom: "2025-09-01",
      validUntil: "2026-10-29",
    });
    expect(store.tables["student_guardians"]).toHaveLength(1);
    expect(store.tables["student_guardians"]?.[0]).toMatchObject({
      valid_until: "2026-10-29",
      is_primary: false,
    });
  });

  it("vínculo com início futuro fecha no próprio início", async () => {
    const store = memoryDb({ student_guardians: [link({ valid_from: "2026-11-15" })] });
    const closed = await closeGuardianLink(store.db, { ...ids, today: "2026-10-29" });
    expect(closed.validUntil).toBe("2026-11-15");
  });

  it("não volta a fechar um vínculo já terminado nem o de outra escola", async () => {
    const ended = memoryDb({ student_guardians: [link({ valid_until: "2026-01-10" })] });
    await expect(closeGuardianLink(ended.db, { ...ids, today: "2026-10-29" })).rejects.toThrow(
      /já não é encarregada/,
    );
    expect(ended.writes).toEqual([]);

    const foreign = memoryDb({ student_guardians: [link({ school_id: "escola-b" })] });
    await expect(closeGuardianLink(foreign.db, { ...ids, today: "2026-10-29" })).rejects.toThrow(
      /já não é encarregada/,
    );
    expect(foreign.writes).toEqual([]);
  });

  const linkInput = {
    ...ids,
    relationship: "guardian",
    isPrimary: false,
    userId: "secretaria",
    today: "2026-10-29",
  };

  it("ligar de novo reabre o mesmo registo e devolve o período anterior", async () => {
    const store = memoryDb({
      student_guardians: [link({ valid_until: "2026-01-10", is_primary: false })],
    });
    const result = await linkGuardian(store.db, linkInput);
    expect(result).toEqual({
      reopened: true,
      previous: { validFrom: "2025-09-01", validUntil: "2026-01-10" },
    });
    expect(store.tables["student_guardians"]).toHaveLength(1);
    expect(store.tables["student_guardians"]?.[0]).toMatchObject({
      relationship: "guardian",
      valid_from: "2026-10-29",
      valid_until: null,
    });
  });

  it("não duplica um vínculo que ainda está vigente", async () => {
    const store = memoryDb({ student_guardians: [link()] });
    await expect(linkGuardian(store.db, linkInput)).rejects.toThrow(/já é encarregada/);
    expect(store.writes).toEqual([]);
  });

  it("pessoa nova cria vínculo; como principal, retira o principal anterior", async () => {
    const store = memoryDb({ student_guardians: [link({ guardian_person_id: "pessoa-pai" })] });
    const result = await linkGuardian(store.db, { ...linkInput, isPrimary: true });
    expect(result).toEqual({ reopened: false, previous: null });
    const rows = store.tables["student_guardians"] ?? [];
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row["guardian_person_id"] === "pessoa-pai")?.["is_primary"]).toBe(
      false,
    );
    expect(rows.find((row) => row["guardian_person_id"] === GUARDIAN)?.["is_primary"]).toBe(true);
  });

  it("fusão: reabre o vínculo fechado da ficha que fica quando o duplicado está vigente", async () => {
    const store = memoryDb({
      student_guardians: [
        link({ id: "v-surv", guardian_person_id: "surv", valid_until: "2026-01-10" }),
        link({ id: "v-dup", guardian_person_id: "dup" }),
        // Fechado nos dois lados: nada a reabrir.
        link({
          id: "v-surv-2",
          student_id: "aluno-2",
          guardian_person_id: "surv",
          valid_until: "2026-01-10",
        }),
        link({
          id: "v-dup-2",
          student_id: "aluno-2",
          guardian_person_id: "dup",
          valid_until: "2026-02-01",
        }),
      ],
    });
    const reopened = await reopenSurvivorGuardianLinks(store.db, {
      schoolId: SCHOOL,
      survivorId: "surv",
      duplicateId: "dup",
      today: "2026-10-29",
    });
    expect(reopened).toBe(1);
    const byId = new Map((store.tables["student_guardians"] ?? []).map((row) => [row["id"], row]));
    expect(byId.get("v-surv")?.["valid_until"]).toBeNull();
    expect(byId.get("v-surv-2")?.["valid_until"]).toBe("2026-01-10");
  });
});

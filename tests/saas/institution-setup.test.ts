import { describe, expect, it } from "vitest";
import { setupChecklist, setupProgress, type SetupFacts } from "@/features/saas/institution-setup";

const empty: SetupFacts = {
  teachingLevels: [],
  hasActiveYear: true,
  terms: 0,
  hasLocation: false,
  hasLogo: false,
  rooms: 0,
  shifts: 0,
  classGroups: 0,
  feePlans: 0,
  staff: 1,
  students: 0,
};

describe("configuração inicial", () => {
  it("escola acabada de criar sem ensino: o essencial fica por fazer, o resto pode esperar", () => {
    const items = setupChecklist(empty);
    const progress = setupProgress(items);
    expect(progress.done).toBe(0);
    expect(progress.essentialLeft).toBe(3);
    expect(items.filter((i) => i.essential).map((i) => i.id)).toEqual([
      "ensino",
      "periodos",
      "turmas",
    ]);
    expect(items.find((i) => i.id === "ensino")?.href).toBe("/configuracoes/inicial");
  });

  it("escola criada com perfil: ensino, períodos, turnos e salas já feitos", () => {
    const items = setupChecklist({
      ...empty,
      teachingLevels: ["primario", "i_ciclo"],
      terms: 3,
      shifts: 2,
      rooms: 12,
      feePlans: 1,
    });
    const done = items.filter((i) => i.done).map((i) => i.id);
    expect(done).toEqual(["ensino", "periodos", "turnos", "salas", "propinas"]);
    expect(setupProgress(items).essentialLeft).toBe(1);
    expect(items.find((i) => i.id === "salas")?.detail).toBe("12 salas");
  });

  it("sem ano lectivo activo os períodos não contam como feitos", () => {
    const item = setupChecklist({ ...empty, hasActiveYear: false, terms: 0 }).find(
      (i) => i.id === "periodos",
    );
    expect(item?.done).toBe(false);
    expect(item?.detail).toBe("Sem ano lectivo activo.");
  });

  it("o administrador sozinho não conta como equipa", () => {
    expect(setupChecklist(empty).find((i) => i.id === "equipa")?.done).toBe(false);
    expect(setupChecklist({ ...empty, staff: 4 }).find((i) => i.id === "equipa")?.done).toBe(true);
  });
});

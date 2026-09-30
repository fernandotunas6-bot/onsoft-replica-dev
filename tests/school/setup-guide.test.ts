import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSetupGuide, type SetupCounts } from "@/features/school/setup-guide";

/** Escola acabada de criar: só o que o provisionamento deixa. */
const NOVA: SetupCounts = {
  school: { nif: true, director: false, contact: true, logo: false },
  activeYear: null,
  termsInActiveYear: 0,
  programs: 0,
  gradeLevels: 0,
  subjects: 0,
  classGroupsInActiveYear: 0,
  rooms: 0,
  assessmentModel: false,
  activeFeePlanWithItems: false,
  otherMembers: 0,
  pendingInvitations: 0,
  students: 0,
  publicEnrollmentOpen: true,
};

const PRONTA: SetupCounts = {
  school: { nif: true, director: true, contact: true, logo: true },
  activeYear: { name: "2026/2027" },
  termsInActiveYear: 3,
  programs: 1,
  gradeLevels: 6,
  subjects: 10,
  classGroupsInActiveYear: 4,
  rooms: 4,
  assessmentModel: true,
  activeFeePlanWithItems: true,
  otherMembers: 3,
  pendingInvitations: 0,
  students: 120,
  publicEnrollmentOpen: true,
};

const step = (counts: SetupCounts, id: string) =>
  buildSetupGuide(counts).steps.find((s) => s.id === id)!;

describe("guia de arranque da escola", () => {
  it("escola nova: começa pelos dados da escola e nada está pronto", () => {
    const guide = buildSetupGuide(NOVA);
    expect(guide.nextStepId).toBe("escola");
    expect(guide.completed).toBe(0);
    expect(guide.ready).toBe(false);
    expect(step(NOVA, "escola").detail).toContain("director(a)");
  });

  it("a ordem segue as dependências: não se matricula antes de turmas e propinas", () => {
    const alunos = step(NOVA, "alunos");
    expect(alunos.blockedBy).toEqual(["turmas", "propinas"]);
    expect(step(NOVA, "trimestres").blockedBy).toEqual(["ano"]);
    expect(step(NOVA, "estrutura").blockedBy).toEqual(["trimestres"]);
    expect(step(NOVA, "propinas").blockedBy).toEqual(["ano"]);
  });

  it("o próximo passo salta os bloqueados e os feitos", () => {
    const guide = buildSetupGuide({
      ...NOVA,
      school: { ...NOVA.school, director: true },
      activeYear: { name: "2026/2027" },
    });
    expect(guide.nextStepId).toBe("trimestres");
    expect(step({ ...NOVA, activeYear: { name: "x" } }, "propinas").blockedBy).toEqual([]);
  });

  it("uma escola completa está pronta e sem próximo passo", () => {
    const guide = buildSetupGuide(PRONTA);
    expect(guide.ready).toBe(true);
    expect(guide.nextStepId).toBeNull();
    expect(guide.completed).toBe(guide.total);
  });

  it("passos opcionais não contam para «pronta»", () => {
    const guide = buildSetupGuide({ ...PRONTA, publicEnrollmentOpen: false });
    expect(guide.ready).toBe(true);
    expect(guide.steps.find((s) => s.id === "matricula")?.done).toBe(false);
  });

  it("convites pendentes já contam como equipa convidada", () => {
    expect(step({ ...NOVA, pendingInvitations: 2 }, "equipa").done).toBe(true);
  });

  it("o logótipo é opcional nos dados da escola", () => {
    const escola = step({ ...NOVA, school: { ...NOVA.school, director: true } }, "escola");
    expect(escola.done).toBe(true);
    expect(escola.detail).toContain("logótipo");
  });
});

describe("o guia aponta para ecrãs que existem", () => {
  const raiz = resolve(__dirname, "../..");

  it("cada rota do guia existe e cada separador da Pedagógica é aceite", () => {
    const rotas = readFileSync(resolve(raiz, "src/routeTree.gen.ts"), "utf8");
    const pedagogica = readFileSync(resolve(raiz, "src/routes/pedagogica.tsx"), "utf8");
    for (const s of buildSetupGuide(NOVA).steps) {
      if (s.action.kind !== "route") continue;
      expect(rotas, `${s.id} → ${s.action.to}`).toMatch(
        new RegExp(`'${s.action.to}/?'\\s*:\\s*typeof`),
      );
      const tab = s.action.search?.["tab"];
      if (tab) expect(pedagogica, `separador ${tab}`).toContain(`"${tab}"`);
    }
  });

  it("cada painel de definições do guia existe no SettingsCenter", () => {
    const settings = readFileSync(
      resolve(raiz, "src/components/modals/SettingsCenter.tsx"),
      "utf8",
    );
    for (const s of buildSetupGuide(NOVA).steps) {
      if (s.action.kind !== "settings") continue;
      expect(settings, `painel ${s.action.panel}`).toContain(`id: "${s.action.panel}"`);
    }
  });
});

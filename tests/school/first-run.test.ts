import { describe, expect, it } from "vitest";
import { buildSetupGuide, type SetupCounts } from "@/features/school/setup-guide";
import {
  FIRST_RUN_SCREENS,
  resumeScreen,
  screenDone,
  shouldAutoOpenFirstRun,
} from "@/features/school/first-run";

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
  publicEnrollmentOpen: false,
};

describe("configuração inicial", () => {
  it("escola acabada de criar abre o assistente no ecrã de boas-vindas", () => {
    const guide = buildSetupGuide(NOVA);
    expect(shouldAutoOpenFirstRun(guide, "open", true)).toBe(true);
    expect(resumeScreen(guide)).toBe("boas-vindas");
  });

  it("não abre sozinho para quem não é Administrador ou o dispensou", () => {
    const guide = buildSetupGuide(NOVA);
    expect(shouldAutoOpenFirstRun(guide, "open", false)).toBe(false);
    expect(shouldAutoOpenFirstRun(guide, "skipped", true)).toBe(false);
    expect(shouldAutoOpenFirstRun(guide, "finished", true)).toBe(false);
  });

  it("escola já com ano lectivo não é tratada como nova", () => {
    const guide = buildSetupGuide({
      ...NOVA,
      activeYear: { name: "2026/2027" },
      termsInActiveYear: 3,
    });
    expect(shouldAutoOpenFirstRun(guide, "open", true)).toBe(false);
  });

  it("retoma no primeiro ecrã por fazer", () => {
    const guide = buildSetupGuide({
      ...NOVA,
      school: { nif: true, director: true, contact: true, logo: false },
      activeYear: { name: "2026/2027" },
      termsInActiveYear: 3,
    });
    const calendario = FIRST_RUN_SCREENS.find((s) => s.id === "calendario")!;
    expect(screenDone(calendario, guide)).toBe(true);
    expect(resumeScreen(guide)).toBe("estrutura");
  });

  it("todos os passos do guia (menos alunos e matrícula) têm ecrã", () => {
    const covered = new Set(FIRST_RUN_SCREENS.flatMap((s) => s.steps));
    const guide = buildSetupGuide(NOVA);
    const missing = guide.steps
      .map((s) => s.id)
      .filter((id) => !covered.has(id) && id !== "alunos" && id !== "matricula");
    expect(missing).toEqual([]);
  });
});

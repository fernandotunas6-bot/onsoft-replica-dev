import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { publicErrorMessage } from "@/lib/public-error";
import { isTwoFactorRequiredMessage } from "@/lib/two-factor-error";
import {
  GRADE_SHEET_MFA_MESSAGE,
  MISSING_ASSESSMENT_MODEL_MESSAGE,
  buildPrePautaChecks,
  gradeSheetDbMessage,
  canRebuildGradeSheet,
  gradeSheetActions,
  isGradeSheetLocked,
  prePautaIsClean,
} from "@/features/academic/grade-sheet-workflow";

const subject = (over = {}) => ({
  subjectName: "Matemática",
  hasTeacher: true,
  gradebookStatus: "submitted",
  missingMac: 0,
  missingNpt: 0,
  outOfScale: 0,
  pendingChanges: 0,
  ...over,
});

describe("fluxo da pauta", () => {
  it("acções por estado espelham transition_grade_sheet", () => {
    expect(gradeSheetActions("draft").map((a) => a.next)).toEqual(["submitted", "rebuild"]);
    expect(gradeSheetActions("submitted").map((a) => a.next)).toEqual([
      "in_review",
      "homologated",
      "rebuild",
    ]);
    expect(gradeSheetActions("homologated").map((a) => a.next)).toEqual(["published", "closed"]);
    expect(gradeSheetActions("published").map((a) => a.next)).toEqual([
      "closed",
      "contested",
      "rectified",
    ]);
    expect(gradeSheetActions("closed")).toEqual([
      { next: "rectified", label: "Reabrir para rectificação", needsReason: true },
    ]);
  });

  it("reabrir exige motivo; publicada e fechada ficam bloqueadas", () => {
    expect(gradeSheetActions("published").find((a) => a.next === "rectified")?.needsReason).toBe(
      true,
    );
    expect(isGradeSheetLocked("published")).toBe(true);
    expect(isGradeSheetLocked("closed")).toBe(true);
    expect(isGradeSheetLocked("draft")).toBe(false);
  });

  it("nunca recalcula (apagar linhas) depois de homologada", () => {
    expect(canRebuildGradeSheet(null)).toBe(true);
    expect(canRebuildGradeSheet("in_review")).toBe(true);
    for (const s of ["homologated", "published", "closed", "contested"] as const) {
      expect(canRebuildGradeSheet(s)).toBe(false);
    }
  });
});

describe("pré-pauta", () => {
  it("limpa quando tudo está lançado e submetido", () => {
    const checks = buildPrePautaChecks({
      enrolled: 30,
      hasActiveRule: true,
      subjects: [subject()],
    });
    expect(prePautaIsClean(checks)).toBe(true);
  });

  it("aponta cada problema com detalhe", () => {
    const checks = buildPrePautaChecks({
      enrolled: 30,
      hasActiveRule: false,
      subjects: [
        subject({
          subjectName: "Física",
          hasTeacher: false,
          gradebookStatus: "open",
          missingNpt: 4,
        }),
        subject({ subjectName: "Química", outOfScale: 1, pendingChanges: 2 }),
      ],
    });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(prePautaIsClean(checks)).toBe(false);
    expect(byId.rule!.ok).toBe(false);
    expect(byId.teachers!.detail).toBe("Sem professor: Física");
    expect(byId.gradebooks!.detail).toBe("Por submeter: Física");
    expect(byId.missing!.detail).toBe("4 em falta em Física");
    expect(byId.scale!.detail).toBe("1 fora da escala");
    expect(byId.pending!.detail).toBe("2 à espera de aprovação");
  });

  it("exige gerar de novo a pauta se houve notas alteradas depois", () => {
    const base = { enrolled: 30, hasActiveRule: true, subjects: [subject()] };
    // Pauta ainda por gerar: a verificação não se aplica.
    expect(buildPrePautaChecks(base).some((c) => c.id === "fresh")).toBe(false);

    const fresh = buildPrePautaChecks({ ...base, scoresChangedAfterBuild: 0 });
    expect(prePautaIsClean(fresh)).toBe(true);

    const stale = buildPrePautaChecks({ ...base, scoresChangedAfterBuild: 3 });
    expect(prePautaIsClean(stale)).toBe(false);
    expect(stale.find((c) => c.id === "fresh")!.detail).toMatch(
      /3 nota\(s\) alterada\(s\).*gere-a de novo/,
    );
  });

  it("a verificação da escala diz qual é a escala do modelo", () => {
    const checks = buildPrePautaChecks({
      enrolled: 1,
      hasActiveRule: true,
      subjects: [subject()],
      scale: { minimum: 0, maximum: 100 },
    });
    expect(checks.find((c) => c.id === "scale")!.label).toBe("Notas dentro da escala 0–100");
    const fallback = buildPrePautaChecks({
      enrolled: 1,
      hasActiveRule: true,
      subjects: [subject()],
    });
    expect(fallback.find((c) => c.id === "scale")!.label).toBe("Notas dentro da escala 0–20");
  });
});

describe("mensagens da base na pauta oficial", () => {
  it("troca as conhecidas por texto que diz o que fazer", () => {
    expect(gradeSheetDbMessage({ message: "Regra de avaliação ativa em falta." })).toBe(
      MISSING_ASSESSMENT_MODEL_MESSAGE,
    );
    expect(gradeSheetDbMessage({ message: "MFA obrigatório." })).toBe(GRADE_SHEET_MFA_MESSAGE);
    expect(gradeSheetDbMessage({ message: "  Reabertura exige motivo. " })).toMatch(/motivo/);
  });

  it("não deixa passar mais nada (estrutura, SQL, desconhecidas)", () => {
    for (const message of [
      'duplicate key value violates unique constraint "grade_sheets_pkey"',
      "permission denied for function build_grade_sheet",
      "Regra de avaliação ativa em falta",
      "",
      undefined,
    ]) {
      expect(gradeSheetDbMessage({ message }), String(message)).toBeNull();
    }
  });

  it("cobre exactamente as mensagens de build_grade_sheet e transition_grade_sheet", () => {
    const dir = resolve(__dirname, "../../supabase/migrations");
    const latest = (fn: string) => {
      let body = "";
      for (const file of readdirSync(dir).sort()) {
        const sql = readFileSync(resolve(dir, file), "utf8");
        const start = sql.indexOf(`CREATE OR REPLACE FUNCTION private.${fn}(`);
        if (start < 0) continue;
        const rest = sql.slice(start);
        body = rest.slice(0, rest.indexOf("$function$;", rest.indexOf("$function$") + 10));
      }
      return body;
    };
    const raised = new Set(
      ["build_grade_sheet", "transition_grade_sheet"].flatMap((fn) =>
        [...latest(fn).matchAll(/message = '([^']+)'/g)].map((m) => m[1]!),
      ),
    );
    expect(raised.size).toBeGreaterThan(5);
    for (const message of raised) {
      expect(gradeSheetDbMessage({ message }), message).not.toBeNull();
    }
    for (const message of [
      "Regra de avaliação ativa em falta.",
      "MFA obrigatório.",
      "Sem autorização para construir pauta.",
    ]) {
      expect(raised.has(message), message).toBe(true);
    }
  });

  it("chegam ao ecrã; só a de 2FA abre o aviso com «Activar 2FA»", () => {
    const shown = [
      "Regra de avaliação ativa em falta.",
      "MFA obrigatório.",
      "Sem autorização para construir pauta.",
      "Transição de estado da pauta não permitida.",
      "Reabertura exige motivo.",
    ].map((message) => gradeSheetDbMessage({ message })!);
    for (const text of [...shown, GRADE_SHEET_MFA_MESSAGE, MISSING_ASSESSMENT_MODEL_MESSAGE]) {
      expect(publicErrorMessage(new Error(text), "genérica"), text).toBe(text);
      expect(isTwoFactorRequiredMessage(text), text).toBe(text === GRADE_SHEET_MFA_MESSAGE);
    }
  });
});

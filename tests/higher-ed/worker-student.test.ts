import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  academicStanding,
  frequencyOutcome,
  seasonEligibility,
  type PlanUnit,
  type UnitRecord,
} from "@/features/higher-ed/engine";
import { statusInForce } from "@/features/higher-ed/student-status";
import { HIGHER_ED_DEFAULTS, parseSettingsDomain } from "@/features/school/settings-domains";

const reg = HIGHER_ED_DEFAULTS;
const worker = { workerStudent: true };
const unit = (id: string, semester: number): PlanUnit => ({
  id,
  subjectId: `s-${id}`,
  name: id,
  semester,
  credits: 6,
});
const plan = [1, 1, 1, 2, 2, 3, 3, 4].map((semester, i) => unit(`u${i}`, semester));
const rec = (unitId: string, status: UnitRecord["status"], year = "y1"): UnitRecord => ({
  unitId,
  academicYearId: year,
  attempt: 1,
  status,
  season: "normal",
  finalGrade: status === "aprovado" ? 12 : null,
  credits: 6,
  creditsEarned: status === "aprovado" ? 6 : 0,
});

describe("trabalhador-estudante", () => {
  it("as faltas não o excluem (se o regulamento o disser)", () => {
    expect(frequencyOutcome(12, 40, reg).kind).toBe("excluido_faltas");
    expect(frequencyOutcome(12, 40, reg, worker).kind).toBe("admitido");
    expect(
      frequencyOutcome(12, 40, { ...reg, worker_student_absence_exempt: false }, worker).kind,
    ).toBe("excluido_faltas");
  });

  it("vai à época especial sem ser finalista", () => {
    const records = [rec("u0", "reprovado")];
    expect(seasonEligibility({ unitId: "u0", records, plan, regulation: reg }).especial).toBe(
      false,
    );
    expect(
      seasonEligibility({ unitId: "u0", records, plan, regulation: reg, status: worker }).especial,
    ).toBe(true);
    expect(
      seasonEligibility({
        unitId: "u0",
        records,
        plan,
        regulation: { ...reg, worker_student_special_season: false },
        status: worker,
      }).especial,
    ).toBe(false);
  });

  it("cada ano conta metade para a situação académica e a prescrição", () => {
    // Um ano frequentado, 3 cadeiras do 1.º semestre feitas (18 de 30 esperados = 60 %).
    const records = [rec("u0", "aprovado"), rec("u1", "aprovado"), rec("u2", "aprovado")];
    expect(academicStanding({ plan, records, regulation: reg }).standing).toBe("em_atraso");
    const ws = academicStanding({ plan, records, regulation: reg, status: worker });
    expect(ws.standing).toBe("regular");
    expect(ws.yearsAttended).toBe(1);
    expect(ws.countedYears).toBe(0.5);
    // Prescrição: 4 anos de trabalhador-estudante contam 2.
    const four = ["a", "b", "c", "d"].map((year) => rec("u0", "reprovado", year));
    const strict = { ...reg, max_extra_years: 1 };
    expect(academicStanding({ plan, records: four, regulation: strict }).standing).toBe(
      "prazo_excedido",
    );
    expect(
      academicStanding({ plan, records: four, regulation: strict, status: worker }).standing,
    ).not.toBe("prazo_excedido");
  });

  it("regulamento: valores de partida e limites", () => {
    const parsed = parseSettingsDomain("higher_ed", { worker_student_progress_percent: 5 });
    expect(parsed.worker_student_progress_percent).toBe(10);
    expect(parsed.worker_student_absence_exempt).toBe(true);
    expect(parsed.worker_student_special_season).toBe(true);
  });

  it("estatuto em vigor só entre as datas e se não foi revogado", () => {
    const row = { valid_from: "2026-10-01", valid_until: "2027-07-31", revoked_at: null };
    expect(statusInForce(row, "2026-09-30")).toBe(false);
    expect(statusInForce(row, "2026-10-01")).toBe(true);
    expect(statusInForce(row, "2027-08-01")).toBe(false);
    expect(statusInForce({ ...row, revoked_at: "2026-11-01T00:00:00Z" }, "2026-12-01")).toBe(false);
  });

  it("a tabela é só do servidor", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../supabase/migrations/20261004140000_student_special_statuses.sql"),
      "utf8",
    );
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toMatch(
      /REVOKE ALL ON public\.student_special_statuses FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toContain("public.siga_touch_updated_at()");
    expect(sql).not.toMatch(/CREATE POLICY/);
  });
});

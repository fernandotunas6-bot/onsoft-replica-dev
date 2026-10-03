/**
 * Achado agravante (docs/auditoria/04-auditoria.md, 4.3): create_timetable_slot_guarded e
 * update_timetable_slot_guarded eram a ÚNICA barreira contra duplo agendamento, e nenhuma
 * das duas é SECURITY DEFINER — `authenticated` tem GRANT directo de INSERT/UPDATE em
 * timetable_slots com políticas RLS permissivas (restritas a can_manage_students(), mas
 * ainda um caminho directo). Um insert que não passasse pelas funções guardadas nunca era
 * verificado.
 *
 * migrations/20260924141600_timetable_slot_overlap_trigger.sql fecha isto com um trigger
 * (padrão já usado para notas em enforce_teacher_grade_score_scope): corre em qualquer
 * INSERT/UPDATE de timetable_slots, directo ou pelas funções guardadas, e RLS não o
 * contorna. Este teste garante que o trigger continua presente e ligado em produção — se
 * alguém o remover ou desactivar por engano, falha aqui antes de falhar em silêncio.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const snap = JSON.parse(
  readFileSync(resolve(process.cwd(), "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as {
  triggers: Array<{ tabela: string; trigger: string; funcao: string; funcao_schema: string }>;
  funcoes: Array<{ schema: string; funcao: string }>;
};

describe("rede declarativa contra sobreposição de horários", () => {
  it("o trigger timetable_slot_no_overlap está presente em timetable_slots", () => {
    const trigger = snap.triggers.find(
      (t) => t.tabela === "timetable_slots" && t.trigger === "timetable_slot_no_overlap",
    );
    expect(
      trigger,
      "trigger timetable_slot_no_overlap não encontrado no retrato — corra npm run siga:db-snapshot " +
        "se a migração 20260924141600 foi aplicada, ou reaplique-a se não foi.",
    ).toBeDefined();
    expect(trigger?.funcao).toBe("enforce_timetable_slot_no_overlap");
    expect(trigger?.funcao_schema).toBe("private");
  });

  it("create_timetable_slot_guarded e update_timetable_slot_guarded continuam expostas em public", () => {
    const nomes = new Set(snap.funcoes.filter((f) => f.schema === "public").map((f) => f.funcao));
    expect(nomes.has("create_timetable_slot_guarded")).toBe(true);
    expect(nomes.has("update_timetable_slot_guarded")).toBe(true);
  });
});

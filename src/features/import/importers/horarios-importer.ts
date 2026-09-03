import { normalizeText } from "../engine/normalize";
import type { ImportRefCache, RowImporter } from "../engine/types";
import { uniqueExactMatch } from "./academic-core";

type Ref = { id: string; code: string; name: string };
type HorariosCache = ImportRefCache & {
  classGroups: Ref[];
  subjects: Ref[];
  existingSlots: Set<string>; // key: `${class_group_id}:${weekday}:${starts_at}`
};

function valueOf(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && normalizeText(value)) return value;
  }
  return null;
}

function parseWeekday(val: unknown): number | null {
  const norm = normalizeText(val).toLowerCase();
  if (norm.includes("segunda") || norm === "1" || norm === "seg") return 1;
  if (norm.includes("terca") || norm.includes("terça") || norm === "2" || norm === "ter") return 2;
  if (norm.includes("quarta") || norm === "3" || norm === "qua") return 3;
  if (norm.includes("quinta") || norm === "4" || norm === "qui") return 4;
  if (norm.includes("sexta") || norm === "5" || norm === "sex") return 5;
  if (norm.includes("sabado") || norm.includes("sábado") || norm === "6" || norm === "sab") return 6;
  return null;
}

export const horariosImporter: RowImporter = {
  module: "horarios",

  async loadRefCache(ctx) {
    const [groups, subjects, slotRows] = await Promise.all([
      ctx.db.from("class_groups").select("id, code, name").eq("school_id", ctx.schoolId),
      ctx.db.from("subjects").select("id, code, name").eq("school_id", ctx.schoolId),
      ctx.db
        .from("class_schedule_slots")
        .select("class_group_id, weekday, starts_at")
        .eq("school_id", ctx.schoolId),
    ]);

    if (groups.error) throw new Error(`Não foi possível carregar turmas: ${groups.error.message}`);
    if (subjects.error) throw new Error(`Não foi possível carregar disciplinas: ${subjects.error.message}`);
    if (slotRows.error) throw new Error(`Não foi possível carregar horários: ${slotRows.error.message}`);

    const existingSlots = new Set(
      (slotRows.data ?? []).map(
        (r) => `${r.class_group_id}:${r.weekday}:${normalizeText(r.starts_at)}`,
      ),
    );

    return {
      existingPeople: [],
      classGroups: (groups.data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
      studentByPersonId: new Map(),
      subjects: (subjects.data ?? []).map((r) => ({
        id: String(r.id),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
      })),
      existingSlots,
    } as HorariosCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as HorariosCache;
    const errors: string[] = [];
    const warnings: string[] = [];

    const groupVal = valueOf(normalized, "class_group", "turma", "codigo_turma");
    const subjectVal = valueOf(normalized, "subject", "disciplina", "materia");
    const weekday = parseWeekday(valueOf(normalized, "weekday", "dia", "dia_semana"));
    const startTime = normalizeText(valueOf(normalized, "start_time", "inicio", "hora_inicio"));
    const endTime = normalizeText(valueOf(normalized, "end_time", "fim", "hora_fim"));

    if (!groupVal) errors.push("Turma é obrigatória.");
    if (!subjectVal) errors.push("Disciplina é obrigatória.");
    if (!weekday) errors.push("Dia da semana inválido (ex: Segunda-feira, Terça-feira...).");
    if (!startTime) errors.push("Hora de início é obrigatória (ex: 07:30).");
    if (!endTime) errors.push("Hora de fim é obrigatória (ex: 08:15).");

    if (errors.length) return { status: "error", warnings, errors };

    const groupMatch = uniqueExactMatch(groupVal, cache.classGroups, [(r) => r.code, (r) => r.name]);
    if (groupMatch.ambiguous) errors.push(`Turma "${normalizeText(groupVal)}" é ambígua.`);
    else if (!groupMatch.row) errors.push(`Turma "${normalizeText(groupVal)}" não encontrada nesta escola.`);

    const subjMatch = uniqueExactMatch(subjectVal, cache.subjects, [(r) => r.code, (r) => r.name]);
    if (subjMatch.ambiguous) errors.push(`Disciplina "${normalizeText(subjectVal)}" é ambígua.`);
    else if (!subjMatch.row) errors.push(`Disciplina "${normalizeText(subjectVal)}" não encontrada nesta escola.`);

    if (errors.length) return { status: "error", warnings, errors };

    const slotKey = `${groupMatch.row!.id}:${weekday}:${startTime}`;
    if (cache.existingSlots.has(slotKey)) {
      return {
        status: "duplicate",
        warnings: ["Já existe uma aula agendada para esta turma neste dia e horário."],
        errors: [],
        duplicate_of: slotKey,
      };
    }

    return { status: "valid", warnings, errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as HorariosCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") {
      return { status: "error", warnings: analysis.warnings, errors: analysis.errors, audits: [] };
    }

    const groupVal = valueOf(normalized, "class_group", "turma", "codigo_turma")!;
    const subjectVal = valueOf(normalized, "subject", "disciplina", "materia")!;
    const weekday = parseWeekday(valueOf(normalized, "weekday", "dia", "dia_semana"))!;
    const startTime = normalizeText(valueOf(normalized, "start_time", "inicio", "hora_inicio"))!;
    const endTime = normalizeText(valueOf(normalized, "end_time", "fim", "hora_fim"))!;

    const group = uniqueExactMatch(groupVal, cache.classGroups, [(r) => r.code, (r) => r.name]).row!;
    const subj = uniqueExactMatch(subjectVal, cache.subjects, [(r) => r.code, (r) => r.name]).row!;

    const slotKey = `${group.id}:${weekday}:${startTime}`;
    if (cache.existingSlots.has(slotKey)) {
      return {
        status: "duplicate",
        warnings: analysis.warnings,
        errors: [],
        audits: [],
        entity_id: slotKey,
      };
    }

    const { data, error } = await ctx.db
      .from("class_schedule_slots")
      .insert({
        school_id: ctx.schoolId,
        class_group_id: group.id,
        subject_id: subj.id,
        weekday,
        starts_at: startTime,
        ends_at: endTime,
        label: subj.name,
      })
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        warnings: analysis.warnings,
        errors: [`Erro ao gravar tempo de horário: ${error.message}`],
        audits: [],
      };
    }

    cache.existingSlots.add(slotKey);
    return {
      status: "created",
      warnings: analysis.warnings,
      errors: [],
      audits: [],
      entity_id: String(data.id),
    };
  },
};

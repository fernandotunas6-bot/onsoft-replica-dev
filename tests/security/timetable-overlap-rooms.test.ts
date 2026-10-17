import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectScheduleConflicts,
  PLACEHOLDER_ROOM_LABELS,
} from "@/features/academic/schedule/utils/conflicts";
import type { ScheduleSlot } from "@/features/academic/schedule/types";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations/20260924150000_timetable_overlap_ignores_placeholder_rooms.sql",
  ),
  "utf8",
);

const oneRule = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations/20261010100000_timetable_rooms_one_placeholder_rule.sql",
  ),
  "utf8",
);

/** As etiquetas que significam "sala por atribuir", não uma sala. */
const MARCADORES = [...PLACEHOLDER_ROOM_LABELS];

function slot(over: Partial<ScheduleSlot>): ScheduleSlot {
  return {
    id: "s1",
    class_group_id: "turma-1",
    class_subject_id: "cs-1",
    subject_id: "disc-1",
    teacher_id: null,
    room_id: null,
    label: null,
    weekday: 3,
    starts_at: "08:00:00",
    ends_at: "09:00:00",
    schedule_id: null,
    ...over,
  } as ScheduleSlot;
}

describe("conflito de sala — o cliente", () => {
  it.each(MARCADORES)("não acusa conflito quando ambas dizem %s", (marcador) => {
    const conflitos = detectScheduleConflicts([
      slot({ id: "a", class_group_id: "turma-1", label: marcador }),
      slot({ id: "b", class_group_id: "turma-2", label: marcador }),
    ]);
    expect(conflitos.filter((c) => c.kind === "sala")).toEqual([]);
  });

  it("acusa conflito quando a sala é mesmo uma sala", () => {
    const conflitos = detectScheduleConflicts([
      slot({ id: "a", class_group_id: "turma-1", label: "Sala 101" }),
      slot({ id: "b", class_group_id: "turma-2", label: "sala 101" }),
    ]);
    expect(conflitos.some((c) => c.kind === "sala")).toBe(true);
  });
});

describe("conflito de sala — a base diz o mesmo", () => {
  it("o trigger de 24/09 passou a perguntar ao helper", () => {
    // Se alguém acrescentar um marcador no cliente e esquecer a base, o horário
    // passa a ser recusado por um conflito que a interface não mostra.
    // (A lista desta migração foi alargada a «s/n» pela 20261010100000, abaixo.)
    expect(migration).toMatch(/NOT IN \('sala', 'a definir', 'sem sala fixa'\)/);
  });

  it("a cláusula da sala passa pelo helper, e não pelo teste de vazio", () => {
    // O defeito era `btrim(NEW.room) <> ''` — qualquer texto contava como sala.
    const clausula = migration.slice(
      migration.indexOf("FUNCTION private.enforce_timetable_slot_no_overlap"),
    );
    expect(clausula).toContain("private.timetable_room_is_explicit(NEW.room)");
    expect(clausula).not.toMatch(/AND btrim\(NEW\.room\) <> ''/);
  });

  it("não mexe em mais nada da regra", () => {
    // Turma, docente e sala por id continuam a contar.
    const clausula = migration.slice(
      migration.indexOf("FUNCTION private.enforce_timetable_slot_no_overlap"),
    );
    expect(clausula).toContain("cs.class_group_id = v_class_group_id");
    expect(clausula).toContain("cs.teacher_id = v_teacher_id");
    expect(clausula).toContain("ts.room_id = NEW.room_id");
    expect(clausula).toContain("pg_advisory_xact_lock");
  });
});

describe("conflito de sala — uma só regra (20261010100000)", () => {
  it("o helper da base tem exactamente a lista do cliente", () => {
    const lista = MARCADORES.map((m) => `'${m}'`).join(", ");
    expect(oneRule).toContain(`NOT IN (${lista})`);
  });

  it.each([
    "FUNCTION public.guard_timetable_slot_conflicts",
    "FUNCTION public.create_timetable_slot_guarded",
    "FUNCTION public.update_timetable_slot_guarded",
  ])("%s pergunta ao helper antes de comparar etiquetas", (fn) => {
    const start = oneRule.indexOf(fn);
    expect(start).toBeGreaterThan(-1);
    const corpo = oneRule.slice(start, oneRule.indexOf("$function$;", start));
    expect(corpo).toMatch(/private\.timetable_room_is_explicit\((NEW\.room|p_room_label)\)/);
    expect(corpo).not.toMatch(/btrim\(p_room_label\) <> ''/);
    expect(corpo).not.toMatch(/AND t\.room = NEW\.room/);
  });
});

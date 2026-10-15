import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `20261014140000_timetable_guard_alignment.sql` — auditoria de horários de 10/10.
 *
 * Veio de `audit/timetable-enrollment-2026-10-10`, um ramo que esteve sem PR e cujo
 * único teste vivia em `scripts/`, onde o `include` do vitest
 * (`tests/**\/*.test.{ts,tsx}`) nunca o apanhava — nunca correu uma vez.
 */
const migracao = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20261014140000_timetable_guard_alignment.sql"),
  "utf8",
);

/** As etiquetas que significam «sala por atribuir», não uma sala. */
const MARCADORES = ["sala", "a definir", "sem sala fixa"];

const clausulaDaGuarda = migracao.slice(
  migracao.indexOf("FUNCTION public.guard_timetable_slot_conflicts"),
);

describe("conflito de sala — a guarda diz o mesmo que o trigger", () => {
  it("passa pelo helper em vez de comparar o texto cru", () => {
    // O defeito: `t.room = NEW.room`. Duas aulas sobrepostas com o rótulo por
    // omissão («Sala») davam «A sala já está ocupada», um conflito que a interface
    // não mostra — o cliente e o trigger já tratavam o rótulo como não-sala desde
    // a 20260924150000, e só esta função ficou de fora.
    expect(clausulaDaGuarda).toContain("private.timetable_room_is_explicit(NEW.room)");
    expect(clausulaDaGuarda).not.toMatch(/AND t\.room = NEW\.room/);
  });

  it("compara salas fixas sem diferenciar maiúsculas", () => {
    expect(clausulaDaGuarda).toContain("lower(btrim(t.room)) = lower(btrim(NEW.room))");
  });

  it("não mexe em mais nada da regra", () => {
    // Turma, docente e hora continuam a contar.
    expect(clausulaDaGuarda).toContain("c.class_group_id = v_class");
    expect(clausulaDaGuarda).toContain("c.teacher_id = v_teacher");
    expect(clausulaDaGuarda).toContain("A hora de fim tem de ser depois da hora de início.");
  });
});

describe("as RPCs guardadas só pelo service_role", () => {
  // Tomam `p_actor` de quem chama e não verificam autorização por dentro
  // (`SECURITY INVOKER`, sem `has_permission`): a aplicação chama-as com a chave de
  // serviço depois do `requireSgaWriterForWrite`. Com EXECUTE para `authenticated`,
  // quem já pudesse escrever em `timetable_slots` chamava-as pelo PostgREST e
  // escolhia o `created_by`/`updated_by` — o rasto deixava de valer.
  it.each(["create_timetable_slot_guarded", "update_timetable_slot_guarded"])(
    "%s: revogada a PUBLIC, anon e authenticated",
    (fn) => {
      expect(migracao).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated`,
        ),
      );
      expect(migracao).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO service_role`),
      );
    },
  );

  it("a função do trigger não é executável pelos papéis do cliente", () => {
    expect(migracao).toMatch(
      /REVOKE ALL ON FUNCTION private\.enforce_timetable_slot_no_overlap\(\) FROM PUBLIC, anon, authenticated/,
    );
  });
});

describe("a migração é segura de reaplicar", () => {
  it("só substitui funções e privilégios", () => {
    expect(migracao).toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(migracao).not.toMatch(/CREATE TABLE|DROP TABLE|ALTER TABLE/);
  });
});

describe("o ponto cego que deixou isto escapar", () => {
  it("os três sítios da regra dos rótulos estão cobertos por testes", () => {
    // A regra vive em três sítios: o cliente (`detectScheduleConflicts`), o trigger
    // (`enforce_timetable_slot_no_overlap`) e a guarda
    // (`guard_timetable_slot_conflicts`). O `timetable-overlap-rooms.test.ts`
    // guardava os dois primeiros; a guarda ficou de fora, e foi por aí que o
    // defeito passou. Este teste fecha o terceiro — se alguém acrescentar um
    // marcador, tem de o acrescentar nos três.
    const dosRotulos = readFileSync(resolve(__dirname, "timetable-overlap-rooms.test.ts"), "utf8");
    expect(dosRotulos).toContain("detectScheduleConflicts");
    expect(dosRotulos).toContain("enforce_timetable_slot_no_overlap");
    for (const marcador of MARCADORES) expect(dosRotulos).toContain(`"${marcador}"`);
  });
});

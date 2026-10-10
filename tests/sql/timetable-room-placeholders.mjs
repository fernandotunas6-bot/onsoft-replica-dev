// Ensaio local (PGlite) de 20261010100000_timetable_rooms_one_placeholder_rule.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/timetable-room-placeholders.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read(
  "../../supabase/migrations/20261010100000_timetable_rooms_one_placeholder_rule.sql",
);
const pacote = read("../../docs/agents/SIGA_aplicar_auditoria14_2026-10-10.sql");
assert.ok(pacote.includes(migration), "o pacote leva a migração tal e qual");

const db = new PGlite();
// Colunas e restrições de timetable_slots como na produção (leitura de 2026-10-10).
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private;
CREATE TABLE public.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  class_group_id uuid NOT NULL, subject_id uuid NOT NULL, teacher_id uuid,
  weekly_periods integer, status text DEFAULT 'active', created_by uuid, updated_by uuid);
CREATE TABLE public.timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  class_subject_id uuid NOT NULL, weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  starts_at time NOT NULL, ends_at time NOT NULL,
  room text NOT NULL CONSTRAINT timetable_slots_room_check
    CHECK (char_length(btrim(room)) >= 1 AND char_length(btrim(room)) <= 80),
  status text NOT NULL DEFAULT 'active', created_by uuid NOT NULL, created_at timestamptz DEFAULT now(),
  updated_by uuid, schedule_id uuid, room_id uuid, shift_id uuid, day_period_number integer, notes text,
  CHECK (ends_at > starts_at));
`);
// O gatilho timetable_slot_no_overlap e o helper, como na produção.
await db.exec(
  read("../../supabase/migrations/20260924150000_timetable_overlap_ignores_placeholder_rooms.sql")
    .replace(/NOTIFY pgrst[^;]*;/, "")
    .replace(
      /COMMIT;/,
      `DROP TRIGGER IF EXISTS timetable_slot_no_overlap ON public.timetable_slots;
       CREATE TRIGGER timetable_slot_no_overlap BEFORE INSERT OR UPDATE ON public.timetable_slots
         FOR EACH ROW EXECUTE FUNCTION private.enforce_timetable_slot_no_overlap();
       COMMIT;`,
    ),
);
// O gatilho guard_timetable_slot_conflicts e a RPC de criar, com os corpos da produção
// (pg_get_functiondef de 2026-10-10): qualquer etiqueta conta como sala.
await db.exec(`
CREATE FUNCTION public.guard_timetable_slot_conflicts() RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public' AS $f$
DECLARE v_conflict text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
  IF NULLIF(btrim(NEW.room), '') IS NOT NULL THEN
    SELECT 'A sala já está ocupada neste horário.' INTO v_conflict
    FROM timetable_slots t
    WHERE t.id <> NEW.id AND t.status = 'active' AND t.school_id = NEW.school_id AND t.weekday = NEW.weekday
      AND t.starts_at < NEW.ends_at AND NEW.starts_at < t.ends_at AND t.room = NEW.room LIMIT 1;
  END IF;
  IF v_conflict IS NOT NULL THEN RAISE EXCEPTION '%', v_conflict USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_guard_timetable_slot_conflicts BEFORE INSERT OR UPDATE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.guard_timetable_slot_conflicts();
CREATE FUNCTION public.create_timetable_slot_guarded(p_school_id uuid, p_class_group_id uuid, p_subject_id uuid, p_teacher_id uuid, p_room_id uuid, p_weekday smallint, p_starts_at time without time zone, p_ends_at time without time zone, p_room_label text, p_shift_id uuid, p_schedule_id uuid, p_day_period_number integer, p_notes text, p_actor uuid)
RETURNS public.timetable_slots LANGUAGE plpgsql SET search_path TO '' AS $f$
DECLARE v_cs uuid; v_conflict uuid; v_result public.timetable_slots;
BEGIN
  SELECT id INTO v_cs FROM public.class_subjects
  WHERE school_id = p_school_id AND class_group_id = p_class_group_id AND subject_id = p_subject_id;
  IF v_cs IS NULL THEN
    INSERT INTO public.class_subjects (school_id, class_group_id, subject_id, teacher_id, weekly_periods)
    VALUES (p_school_id, p_class_group_id, p_subject_id, p_teacher_id, 1) RETURNING id INTO v_cs;
  END IF;
  SELECT ts.id INTO v_conflict FROM public.timetable_slots ts
  WHERE ts.school_id = p_school_id AND ts.weekday = p_weekday AND ts.status = 'active'
    AND ts.starts_at < p_ends_at AND ts.ends_at > p_starts_at
    AND (p_room_label IS NOT NULL AND btrim(p_room_label) <> ''
         AND lower(btrim(ts.room)) = lower(btrim(p_room_label))) LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'Conflito de horário: já existe uma aula desta turma, professor ou sala sobreposta neste dia e horário.'
      USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO public.timetable_slots (school_id, class_subject_id, weekday, starts_at, ends_at, room, room_id, status, created_by)
  VALUES (p_school_id, v_cs, p_weekday, p_starts_at, p_ends_at, p_room_label, p_room_id, 'active', p_actor)
  RETURNING * INTO v_result;
  RETURN v_result;
END $f$;
`);

const SCHOOL = "00000000-0000-0000-0000-00000000000a";
const ACTOR = "00000000-0000-0000-0000-0000000000ff";
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const create = (classGroup, subject, label, opts = {}) =>
  db.query(
    `SELECT (public.create_timetable_slot_guarded($1, $2, $3, $4, $5, $6::smallint, $7::time, $8::time,
       $9, NULL, NULL, NULL, NULL, $10)).id AS id`,
    [
      SCHOOL,
      uuid(classGroup),
      uuid(subject),
      opts.teacher ?? null,
      opts.room ?? null,
      opts.weekday ?? 2,
      opts.startsAt ?? "08:00",
      opts.endsAt ?? "08:45",
      label,
      ACTOR,
    ],
  );
const refused = async (promise, pattern) => {
  await assert.rejects(promise, (error) => pattern.test(String(error.message)));
};
const reset = () =>
  db.exec("DELETE FROM public.timetable_slots; DELETE FROM public.class_subjects;");
const confirmar = pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════"));
const sonda = async () => (await db.query(confirmar)).rows[0]["20261010100000 salas por atribuir"];

// Antes: a segunda turma sem sala («Sala», o que o ecrã envia) é recusada.
assert.equal(await sonda(), "por aplicar");
await create(101, 201, "Sala");
await refused(create(102, 202, "Sala"), /Conflito de horário/);
await reset();

await db.exec(migration);
await db.exec(migration);
assert.equal(await sonda(), "aplicada");

// Depois: as etiquetas de marcador nunca são uma sala, em nenhum dos quatro sítios.
for (const [index, label] of ["Sala", "S/N", "a definir", "Sem sala fixa", " sala "].entries()) {
  await create(110 + index * 2, 201, label);
  await create(111 + index * 2, 202, label);
}
await reset();

// Uma sala de verdade continua a contar (com ou sem maiúsculas), e a turma também.
await create(101, 201, "Sala 101");
await refused(create(102, 202, "sala 101"), /Conflito de horário|sala já está ocupada/);
await refused(create(101, 203, "Sala"), /Conflito de horário|turma já tem aula/);
await create(102, 202, "Sala 101", { startsAt: "08:45", endsAt: "09:30" });
// Sala por id: dois rótulos de marcador na mesma sala física continuam a colidir.
await create(103, 204, "Sala", { room: uuid(900), weekday: 3 });
await refused(create(104, 205, "Sala", { room: uuid(900), weekday: 3 }), /Conflito de horário/);
await reset();

// Editar: mover uma aula sem sala para a hora de outra turma sem sala passa.
await create(101, 201, "Sala");
const { rows } = await create(102, 202, "Sala", { startsAt: "09:00", endsAt: "09:45" });
await db.query(
  `SELECT public.update_timetable_slot_guarded($1, $2, NULL, NULL, NULL, 2::smallint, '08:00'::time,
     '08:45'::time, 'S/N', NULL, NULL, NULL, NULL, $3)`,
  [SCHOOL, rows[0].id, ACTOR],
);
// …e para a sala de outra turma é recusado.
await db.query(`UPDATE public.timetable_slots SET room = 'Lab 2' WHERE id <> $1`, [rows[0].id]);
await refused(
  db.query(
    `SELECT public.update_timetable_slot_guarded($1, $2, NULL, NULL, NULL, 2::smallint, '08:00'::time,
       '08:45'::time, 'lab 2', NULL, NULL, NULL, NULL, $3)`,
    [SCHOOL, rows[0].id, ACTOR],
  ),
  /Conflito de horário/,
);

console.log(
  "timetable-room-placeholders: recusa reproduzida; marcadores livres nos 4 sítios; salas e turmas continuam a colidir; idempotente.",
);

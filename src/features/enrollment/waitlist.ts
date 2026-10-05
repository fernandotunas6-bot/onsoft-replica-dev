import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { sgaClient } from "@/integrations/supabase/sga";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { requireAal2 } from "@/features/hr/require-aal2";
import { schoolTodayIso } from "@/lib/school-date";
import { canPlace, freeSeats, isClassFullError, queuePositions } from "./waitlist-rules";

/**
 * Lista de espera por turma (`class_group_waitlist`, 20261005170000). Só o servidor lhe
 * toca; Administração e Secretaria (módulo Pessoas). Colocar usa `enroll_student` com a
 * sessão do utilizador (2FA e capacidade verificadas na base, sob FOR UPDATE).
 */

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
const OFFICE = ["Administrador", "Secretaria"] as const;

const missingTable = (error: { code?: string; message?: string } | null) =>
  Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /class_group_waitlist/.test(error.message ?? "")),
  );

/**
 * Põe o aluno na fila da turma (ou devolve a posição em que já está). Devolve null se a
 * tabela ainda não existir na base.
 */
export async function addStudentToWaitlist(
  db: Db,
  input: {
    schoolId: string;
    classGroupId: string;
    studentId: string;
    userId: string;
    note?: string | null;
  },
): Promise<{ position: number } | null> {
  const { error } = await db.from("class_group_waitlist").insert({
    school_id: input.schoolId,
    class_group_id: input.classGroupId,
    student_id: input.studentId,
    note: input.note ?? null,
    created_by: input.userId,
  });
  if (error && error.code !== "23505") {
    if (missingTable(error)) return null;
    throw publicDatabaseError(error, "Não foi possível pôr o aluno na lista de espera.");
  }
  const { data: queue } = await db
    .from("class_group_waitlist")
    .select("id, class_group_id, student_id, created_at")
    .eq("school_id", input.schoolId)
    .eq("class_group_id", input.classGroupId)
    .eq("status", "waiting");
  const entries = (queue ?? []).map((row) => ({
    id: String(row.id),
    classGroupId: String(row.class_group_id),
    studentId: String(row.student_id),
    createdAt: String(row.created_at),
  }));
  const mine = entries.find((entry) => entry.studentId === input.studentId);
  return {
    position: mine ? (queuePositions(entries).get(mine.id) ?? entries.length) : entries.length,
  };
}

export const listClassWaitlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("pessoas", context.supabase, context.userId, [
      ...OFFICE,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: rows, error } = await db
      .from("class_group_waitlist")
      .select("id, class_group_id, student_id, note, created_at")
      .eq("school_id", schoolId)
      .eq("status", "waiting")
      .order("created_at", { ascending: true });
    if (error) {
      if (missingTable(error)) return { available: false as const, groups: [] };
      throw publicDatabaseError(error, "Não foi possível ler a lista de espera.");
    }
    const entries = (rows ?? []).map((row) => ({
      id: String(row.id),
      classGroupId: String(row.class_group_id),
      studentId: String(row.student_id),
      createdAt: String(row.created_at),
      note: row.note ? String(row.note) : null,
    }));
    if (!entries.length) return { available: true as const, groups: [] };
    const classIds = [...new Set(entries.map((e) => e.classGroupId))];
    const studentIds = [...new Set(entries.map((e) => e.studentId))];
    const [{ data: groups }, { data: enrollments }, { data: students }] = await Promise.all([
      db
        .from("class_groups")
        .select("id, name, code, capacity")
        .eq("school_id", schoolId)
        .in("id", classIds),
      db
        .from("enrollments")
        .select("class_group_id")
        .eq("school_id", schoolId)
        .in("class_group_id", classIds)
        .in("status", ["pending", "active"]),
      db
        .from("students")
        .select("id, person_id, student_number")
        .eq("school_id", schoolId)
        .in("id", studentIds),
    ]);
    const personIds = (students ?? []).map((s) => String(s.person_id)).filter(Boolean);
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name")
          .eq("school_id", schoolId)
          .in("id", personIds)
      : { data: [] as Array<{ id: string; full_name: string | null }> };
    const nameOfPerson = new Map(
      (people ?? []).map((p) => [String(p.id), String(p.full_name ?? "")]),
    );
    const studentInfo = new Map(
      (students ?? []).map((s) => [
        String(s.id),
        {
          name: nameOfPerson.get(String(s.person_id)) || "Aluno",
          number: s.student_number ? String(s.student_number) : null,
        },
      ]),
    );
    const occupied = new Map<string, number>();
    for (const row of enrollments ?? []) {
      const id = String(row.class_group_id);
      occupied.set(id, (occupied.get(id) ?? 0) + 1);
    }
    const positions = queuePositions(entries);
    return {
      available: true as const,
      groups: (groups ?? [])
        .map((group) => {
          const id = String(group.id);
          const seats = freeSeats(Number(group.capacity ?? 0), occupied.get(id) ?? 0);
          return {
            classGroupId: id,
            name: String(group.name || group.code || "Turma"),
            capacity: Number(group.capacity ?? 0),
            occupied: occupied.get(id) ?? 0,
            freeSeats: seats,
            entries: entries
              .filter((entry) => entry.classGroupId === id)
              .map((entry) => {
                const position = positions.get(entry.id) ?? 0;
                return {
                  id: entry.id,
                  studentId: entry.studentId,
                  name: studentInfo.get(entry.studentId)?.name ?? "Aluno",
                  number: studentInfo.get(entry.studentId)?.number ?? null,
                  since: entry.createdAt,
                  note: entry.note,
                  position,
                  canPlace: canPlace(position, seats),
                };
              })
              .sort((a, b) => a.position - b.position),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt")),
    };
  });

const addInput = z.object({
  studentId: z.string().uuid(),
  classGroupId: z.string().uuid(),
  note: z.string().trim().max(500).optional().default(""),
});

export const addToClassWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => addInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      ...OFFICE,
    ]);
    const db = await loadSgaAdminClient();
    const [{ data: student }, { data: group }] = await Promise.all([
      db
        .from("students")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("id", data.studentId)
        .maybeSingle(),
      db
        .from("class_groups")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("id", data.classGroupId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    if (!student) throw new Error("Aluno não encontrado nesta escola.");
    if (!group) throw new Error("Turma activa não encontrada nesta escola.");
    const result = await addStudentToWaitlist(db, {
      schoolId: membership.schoolId,
      classGroupId: data.classGroupId,
      studentId: data.studentId,
      userId: context.userId,
      note: data.note || null,
    });
    if (!result) {
      throw new Error(
        "A lista de espera ainda não está disponível nesta base: falta aplicar a migração 20261005170000_class_group_waitlist.",
      );
    }
    return result;
  });

const entryInput = z.object({ entryId: z.string().uuid() });

/** Coloca o aluno na turma (enroll_student) se for a vez dele e houver vaga. */
export const placeFromWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => entryInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      ...OFFICE,
    ]);
    requireAal2(context.claims, "Colocar um aluno da lista de espera");
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: entry, error } = await db
      .from("class_group_waitlist")
      .select("id, class_group_id, student_id, status, created_at")
      .eq("school_id", schoolId)
      .eq("id", data.entryId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível ler a lista de espera.");
    if (!entry || entry.status !== "waiting")
      throw new Error("Este aluno já não está na lista de espera.");
    const classGroupId = String(entry.class_group_id);

    const [{ data: queue }, { data: group }, { count: occupiedCount }] = await Promise.all([
      db
        .from("class_group_waitlist")
        .select("id, class_group_id, student_id, created_at")
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .eq("status", "waiting"),
      db
        .from("class_groups")
        .select("capacity")
        .eq("school_id", schoolId)
        .eq("id", classGroupId)
        .maybeSingle(),
      db
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .in("status", ["pending", "active"]),
    ]);
    const positions = queuePositions(
      (queue ?? []).map((row) => ({
        id: String(row.id),
        classGroupId: String(row.class_group_id),
        studentId: String(row.student_id),
        createdAt: String(row.created_at),
      })),
    );
    const seats = freeSeats(Number(group?.capacity ?? 0), occupiedCount ?? 0);
    const position = positions.get(String(entry.id)) ?? 0;
    if (!canPlace(position, seats)) {
      throw new Error(
        seats === 0
          ? "A turma continua cheia: não há vaga para colocar."
          : `Há ${seats} vaga(s); este aluno está na posição ${position}. Coloque primeiro quem chegou antes.`,
      );
    }

    const { error: enrollError } = await sgaClient(context.supabase).rpc("enroll_student", {
      school_id: schoolId,
      student_id: String(entry.student_id),
      class_group_id: classGroupId,
      enrolled_on: schoolTodayIso(),
    });
    if (enrollError) {
      if (isClassFullError(enrollError)) throw new Error("A turma encheu entretanto: não há vaga.");
      if (enrollError.code === "42501") {
        throw new Error("Esta conta precisa de 2FA activo para matricular alunos.");
      }
      throw publicDatabaseError(enrollError, "Não foi possível colocar o aluno na turma.");
    }
    await db
      .from("class_group_waitlist")
      .update({ status: "placed", placed_at: new Date().toISOString(), placed_by: context.userId })
      .eq("school_id", schoolId)
      .eq("id", String(entry.id));
    // Sai das outras filas em que esperava (já tem turma).
    await db
      .from("class_group_waitlist")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: context.userId,
        cancel_reason: "Colocado noutra turma",
      })
      .eq("school_id", schoolId)
      .eq("student_id", String(entry.student_id))
      .eq("status", "waiting");
    return { placed: true };
  });

const cancelInput = z.object({
  entryId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const cancelWaitlistEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => cancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      ...OFFICE,
    ]);
    const db = await loadSgaAdminClient();
    const { data: row, error } = await db
      .from("class_group_waitlist")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: context.userId,
        cancel_reason: data.reason,
      })
      .eq("school_id", membership.schoolId)
      .eq("id", data.entryId)
      .eq("status", "waiting")
      .select("id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível retirar da lista de espera.");
    if (!row) throw new Error("Esta entrada já não está na lista de espera.");
    return { id: String(row.id) };
  });

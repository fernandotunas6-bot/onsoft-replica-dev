/**
 * Quem recebe avisos de uma turma e como se entregam (servidor).
 *
 * Recebe o cliente de serviço já validado por quem chama — este módulo não
 * decide permissões, só resolve destinatários e grava/envia.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendResendEmail, resolveSystemSender } from "@/features/integrations/resend-client";
import { toSmsText } from "./lesson-messages";
import { escapeHtml } from "@/lib/escape-html";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export type Recipient = {
  userId: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: "teacher" | "student" | "guardian";
  classGroupId: string;
  /** Para encarregados: o educando a que o aviso se refere. */
  studentName?: string | null;
};

const uniq = (values: Array<string | null | undefined>) => [
  ...new Set(values.filter(Boolean).map(String)),
];

/** Professores das disciplinas, alunos com matrícula activa e (opcional) encarregados. */
export async function resolveClassAudience(
  db: Db,
  schoolId: string,
  classGroupIds: string[],
  options: { teachers: boolean; students: boolean; guardians: boolean },
): Promise<Recipient[]> {
  if (!classGroupIds.length) return [];
  const recipients: Recipient[] = [];

  if (options.teachers) {
    const { data: cs } = await db
      .from("class_subjects")
      .select("class_group_id, teacher_id")
      .eq("school_id", schoolId)
      .in("class_group_id", classGroupIds)
      .not("teacher_id", "is", null);
    const teacherIds = uniq((cs ?? []).map((r) => r.teacher_id));
    const { data: teachers } = teacherIds.length
      ? await db
          .from("teachers")
          .select("id, user_id, person_id")
          .eq("school_id", schoolId)
          .in("id", teacherIds)
          .eq("status", "active")
      : { data: [] };
    const people = await loadPeople(db, schoolId, uniq((teachers ?? []).map((t) => t.person_id)));
    const byTeacher = new Map((teachers ?? []).map((t) => [String(t.id), t]));
    const seen = new Set<string>();
    for (const row of cs ?? []) {
      const teacher = byTeacher.get(String(row.teacher_id));
      if (!teacher) continue;
      const key = `${teacher.id}:${row.class_group_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const person = people.get(String(teacher.person_id ?? ""));
      recipients.push({
        userId: teacher.user_id ? String(teacher.user_id) : (person?.user_id ?? null),
        email: person?.email ?? null,
        phone: person?.phone ?? null,
        name: person?.full_name ?? null,
        role: "teacher",
        classGroupId: String(row.class_group_id),
      });
    }
  }

  if (options.students || options.guardians) {
    const { data: enrollments } = await db
      .from("enrollments")
      .select("student_id, class_group_id")
      .eq("school_id", schoolId)
      .in("class_group_id", classGroupIds)
      .eq("status", "active");
    const studentIds = uniq((enrollments ?? []).map((e) => e.student_id));
    const { data: students } = studentIds.length
      ? await db
          .from("students")
          .select("id, person_id")
          .eq("school_id", schoolId)
          .in("id", studentIds)
      : { data: [] };
    const { data: links } =
      options.guardians && studentIds.length
        ? await db
            .from("student_guardians")
            .select("student_id, guardian_person_id")
            .eq("school_id", schoolId)
            .in("student_id", studentIds)
        : { data: [] };
    const people = await loadPeople(
      db,
      schoolId,
      uniq([
        ...(students ?? []).map((s) => s.person_id),
        ...(links ?? []).map((l) => l.guardian_person_id),
      ]),
    );
    const personOfStudent = new Map(
      (students ?? []).map((s) => [String(s.id), String(s.person_id)]),
    );
    for (const enrollment of enrollments ?? []) {
      const studentPerson = people.get(personOfStudent.get(String(enrollment.student_id)) ?? "");
      if (options.students && studentPerson) {
        recipients.push({
          userId: studentPerson.user_id,
          email: studentPerson.email,
          phone: studentPerson.phone,
          name: studentPerson.full_name,
          role: "student",
          classGroupId: String(enrollment.class_group_id),
        });
      }
      if (options.guardians) {
        for (const link of (links ?? []).filter(
          (l) => String(l.student_id) === String(enrollment.student_id),
        )) {
          const guardian = people.get(String(link.guardian_person_id));
          if (!guardian) continue;
          recipients.push({
            userId: guardian.user_id,
            email: guardian.email,
            phone: guardian.phone,
            name: guardian.full_name,
            role: "guardian",
            classGroupId: String(enrollment.class_group_id),
            studentName: studentPerson?.full_name ?? null,
          });
        }
      }
    }
  }
  return recipients;
}

type PersonRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  phone: string | null;
  full_name: string | null;
};

async function loadPeople(db: Db, schoolId: string, ids: string[]) {
  const map = new Map<string, PersonRow>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from("people")
      .select("id, user_id, email, phone, full_name")
      .eq("school_id", schoolId)
      .in("id", ids.slice(i, i + 200));
    for (const row of (data ?? []) as PersonRow[]) map.set(String(row.id), row);
  }
  return map;
}

/** Aviso na aplicação (tabela `notifications`, lida pelo próprio utilizador). */
export async function insertInAppNotifications(
  db: Db,
  schoolId: string,
  rows: Array<{
    userId: string;
    title: string;
    body: string;
    eventType: string;
    payload?: unknown;
  }>,
) {
  const valid = rows.filter((r) => r.userId && r.title.trim() && r.body.trim());
  for (let i = 0; i < valid.length; i += 200) {
    const { error } = await db.from("notifications").insert(
      valid.slice(i, i + 200).map((r) => ({
        school_id: schoolId,
        user_id: r.userId,
        channel: "in_app",
        event_type: r.eventType,
        title: r.title.slice(0, 160),
        body: r.body.slice(0, 4000),
        payload: r.payload ?? {},
        status: "delivered",
      })),
    );
    if (error) throw new Error(`Não foi possível gravar as notificações: ${error.message}`);
  }
  return valid.length;
}

export async function sendLessonEmail(input: {
  to: string;
  title: string;
  body: string;
  schoolName?: string | null;
}) {
  const apiKey = (typeof process !== "undefined" && process.env?.RESEND_API_KEY?.trim()) || "";
  if (!apiKey) return { ok: false as const, error: "RESEND_API_KEY não configurada." };
  const lines = input.body
    .split("\n")
    .map((line) => `<p style="margin:0 0 6px;color:#334155;font-size:14px">${escapeHtml(line)}</p>`)
    .join("");
  try {
    await sendResendEmail({
      apiKey,
      from: resolveSystemSender("academic", { schoolName: input.schoolName ?? undefined }),
      to: [input.to],
      subject: input.title,
      text: `${input.title}\n\n${input.body}`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<p style="margin:0 0 4px;color:#64748b;font-size:12px">${escapeHtml(input.schoolName ?? "SIGA Plus")}</p>
<h2 style="margin:0 0 16px;color:#0f172a;font-size:17px;font-weight:500">${escapeHtml(input.title)}</h2>${lines}</div>`,
    });
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Falha no envio.",
    };
  }
}

/** SMS pelo Twilio (mesmas variáveis do OTP). Número em E.164 (+244…). */
export async function sendLessonSms(input: { to: string; title: string; body: string }) {
  const sid = (typeof process !== "undefined" && process.env?.TWILIO_ACCOUNT_SID?.trim()) || "";
  const token = (typeof process !== "undefined" && process.env?.TWILIO_AUTH_TOKEN?.trim()) || "";
  const from = (typeof process !== "undefined" && process.env?.TWILIO_FROM_NUMBER?.trim()) || "";
  if (!sid || !token || !from) return { ok: false as const, error: "Twilio não configurado." };
  const to = input.to.startsWith("+")
    ? input.to
    : `+244${input.to.replace(/\D/g, "").replace(/^244/, "")}`;
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: from,
          To: to,
          Body: toSmsText(input.title, input.body),
        }).toString(),
      },
    );
    return response.ok
      ? { ok: true as const }
      : { ok: false as const, error: `Twilio ${response.status}` };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Falha no envio.",
    };
  }
}

/**
 * Avisos depois de uma acção já gravada (inscrição, publicação, decisão,
 * tarefa): uma falha no aviso não pode parecer uma falha da acção — senão a
 * pessoa repete-a e ninguém chega a ser avisado. Regista e devolve 0.
 */
export async function notifyAfterAction(
  db: Db,
  schoolId: string,
  rows: Parameters<typeof insertInAppNotifications>[2],
  context: string,
): Promise<number> {
  try {
    return await insertInAppNotifications(db, schoolId, rows);
  } catch (error) {
    console.warn(`[${context}] avisos não enviados:`, error);
    return 0;
  }
}

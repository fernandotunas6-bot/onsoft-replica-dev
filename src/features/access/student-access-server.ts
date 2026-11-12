/**
 * Definição «Os alunos podem entrar com o número de aluno» (Definições → Segurança).
 *
 * Lê-se e grava-se só pelo servidor: quem decide é o Administrador, e mudar a
 * forma de entrar dos alunos pede 2FA nesta sessão. Fica registado na auditoria.
 * O ecrã de entrada pergunta, sem sessão, se a escola do endereço a tem ligada —
 * só para mostrar «Nº de aluno» no campo; a decisão real é a do servidor no login.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { requireAal2 } from "@/features/hr/require-aal2";
import { recordAccessAudit } from "@/features/audit/record-audit";
import { readSettingsDomain, updateSettingsDomainValue } from "@/features/school/settings-domains";
import { STUDENT_ACCESS_DOMAIN, schoolIdForHost } from "./student-number-login";

const ADMIN: ["Administrador"] = ["Administrador"];

export const getStudentAccessSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, ADMIN);
    const db = await loadSgaAdminClient();
    return readSettingsDomain(db, membership.schoolId, "student_access");
  });

export const setStudentNumberLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    requireAal2(context.claims ?? {}, "Mudar a forma de entrar dos alunos");
    const membership = await requireSgaWriterForWrite(
      "gestao",
      context.supabase,
      context.userId,
      ADMIN,
    );
    const db = await loadSgaAdminClient();
    await updateSettingsDomainValue(
      db,
      membership.schoolId,
      STUDENT_ACCESS_DOMAIN,
      (current) => ({
        ...(current && typeof current === "object" ? (current as Record<string, unknown>) : {}),
        student_number_login: data.enabled,
      }),
      context.userId,
    );
    await recordAccessAudit({
      schoolId: membership.schoolId,
      actorUserId: context.userId,
      action: data.enabled ? "student_number_login.enabled" : "student_number_login.disabled",
      entityType: "school_settings",
      entityId: membership.schoolId,
    });
    return { student_number_login: data.enabled };
  });

/** Sem sessão: a escola deste endereço deixa entrar com o número de aluno? */
export const studentNumberLoginAvailable = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const host = getRequestHost().split(":")[0]?.toLowerCase();
    const db = await loadSgaAdminClient();
    const schoolId = await schoolIdForHost(db, host);
    if (!schoolId) return { available: false };
    const settings = await readSettingsDomain(db, schoolId, "student_access");
    return { available: settings.student_number_login };
  } catch {
    return { available: false };
  }
});

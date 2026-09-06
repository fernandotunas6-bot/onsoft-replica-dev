import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

const HR_MATERIALIZE_ROLES = new Set(["Administrador", "Tesouraria"]);

function isoDate(value: unknown, label: string) {
  const date = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label} inválida.`);
  return date;
}

export const materializeTeacherLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const value = (input ?? {}) as Record<string, unknown>;
    return {
      from: isoDate(value.from, "Data inicial"),
      to: isoDate(value.to, "Data final"),
    };
  })
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    if (!HR_MATERIALIZE_ROLES.has(membership.appRole)) {
      throw new Error("Sem permissão para sincronizar aulas remuneráveis.");
    }

    const start = Date.parse(`${data.from}T00:00:00Z`);
    const end = Date.parse(`${data.to}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      throw new Error("Intervalo de sincronização inválido.");
    }
    if (end - start > 31 * 86_400_000) {
      throw new Error("A sincronização não pode exceder 31 dias.");
    }

    const { data: inserted, error } = await context.supabase.rpc("hr_materialize_teacher_lessons", {
      p_from: data.from,
      p_to: data.to,
    });

    if (error) {
      throw publicDatabaseError(
        error,
        "Não foi possível sincronizar o horário com as ocorrências docentes.",
      );
    }

    return {
      from: data.from,
      to: data.to,
      inserted: Number(inserted ?? 0),
    };
  });

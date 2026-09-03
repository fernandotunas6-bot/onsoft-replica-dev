import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");

const calendarTermSchema = z.object({
  sequence: z.number().int().min(1).max(3),
  name: z.string().trim().min(2).max(80),
  startsOn: isoDate,
  endsOn: isoDate,
});

export const saveAcademicCalendarInputSchema = z
  .object({
    academicYearId: z.string().uuid().optional(),
    yearName: z.string().trim().min(4).max(40),
    startsOn: isoDate,
    endsOn: isoDate,
    terms: z.array(calendarTermSchema).length(3),
  })
  .superRefine((value, ctx) => {
    const yearStart = Date.parse(`${value.startsOn}T00:00:00Z`);
    const yearEnd = Date.parse(`${value.endsOn}T00:00:00Z`);
    if (yearStart > yearEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "A data final do ano lectivo deve ser posterior à data inicial.",
      });
    }

    const sequences = value.terms.map((term) => term.sequence).sort();
    if (sequences.join(",") !== "1,2,3") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["terms"],
        message: "Configure exactamente o 1º, 2º e 3º trimestre.",
      });
      return;
    }

    const ordered = [...value.terms].sort((a, b) => a.sequence - b.sequence);
    for (let index = 0; index < ordered.length; index += 1) {
      const term = ordered[index];
      const start = Date.parse(`${term.startsOn}T00:00:00Z`);
      const end = Date.parse(`${term.endsOn}T00:00:00Z`);
      if (start > end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["terms", index, "endsOn"],
          message: `O ${term.sequence}º trimestre tem intervalo de datas inválido.`,
        });
      }
      if (start < yearStart || end > yearEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["terms", index],
          message: `O ${term.sequence}º trimestre deve ficar dentro do ano lectivo.`,
        });
      }
      const previous = ordered[index - 1];
      if (previous) {
        const previousEnd = Date.parse(`${previous.endsOn}T00:00:00Z`);
        if (start <= previousEnd) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["terms", index, "startsOn"],
            message: `O ${term.sequence}º trimestre não pode sobrepor o trimestre anterior.`,
          });
        }
      }
    }
  });

export const listAcademicCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: year, error: yearError } = await db
      .from("academic_years")
      .select("id, name, status, starts_on, ends_on")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (yearError) {
      throw publicDatabaseError(yearError, "Não foi possível carregar o ano lectivo.");
    }
    if (!year?.id) return { academicYear: null, terms: [] };

    const { data: terms, error: termsError } = await db
      .from("terms")
      .select("id, name, sequence, starts_on, ends_on")
      .eq("school_id", membership.schoolId)
      .eq("academic_year_id", year.id)
      .order("sequence");
    if (termsError) {
      throw publicDatabaseError(termsError, "Não foi possível carregar os trimestres.");
    }

    return {
      academicYear: {
        id: String(year.id),
        name: String(year.name),
        status: String(year.status),
        startsOn: String(year.starts_on),
        endsOn: String(year.ends_on),
      },
      terms: (terms ?? []).map((term) => ({
        id: String(term.id),
        name: String(term.name),
        sequence: Number(term.sequence),
        startsOn: String(term.starts_on),
        endsOn: String(term.ends_on),
      })),
    };
  });

export const saveAcademicCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveAcademicCalendarInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: academicYearId, error } = await db.rpc("save_academic_calendar", {
      p_school_id: membership.schoolId,
      p_actor_id: context.userId,
      p_academic_year_id: data.academicYearId ?? null,
      p_year_name: data.yearName,
      p_starts_on: data.startsOn,
      p_ends_on: data.endsOn,
      p_terms: data.terms,
    });
    if (error) {
      throw publicDatabaseError(error, "Não foi possível guardar o calendário académico.");
    }

    return { academicYearId: String(academicYearId), savedTerms: 3 };
  });

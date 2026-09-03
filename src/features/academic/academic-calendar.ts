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

const saveAcademicCalendarInputSchema = z
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

    let academicYearId = data.academicYearId ?? null;

    if (academicYearId) {
      const { data: current, error: currentError } = await db
        .from("academic_years")
        .select("id")
        .eq("id", academicYearId)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (currentError) {
        throw publicDatabaseError(currentError, "Não foi possível validar o ano lectivo.");
      }
      if (!current) throw new Error("Ano lectivo não encontrado nesta escola.");

      const { error } = await db
        .from("academic_years")
        .update({
          name: data.yearName,
          starts_on: data.startsOn,
          ends_on: data.endsOn,
          status: "active",
          updated_by: context.userId,
        })
        .eq("id", academicYearId)
        .eq("school_id", membership.schoolId);
      if (error) {
        throw publicDatabaseError(error, "Não foi possível actualizar o ano lectivo.");
      }
    } else {
      const { data: activeYear, error: activeError } = await db
        .from("academic_years")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeError) {
        throw publicDatabaseError(activeError, "Não foi possível validar o ano lectivo activo.");
      }

      if (activeYear?.id) {
        academicYearId = String(activeYear.id);
        const { error } = await db
          .from("academic_years")
          .update({
            name: data.yearName,
            starts_on: data.startsOn,
            ends_on: data.endsOn,
            updated_by: context.userId,
          })
          .eq("id", academicYearId)
          .eq("school_id", membership.schoolId);
        if (error) {
          throw publicDatabaseError(error, "Não foi possível actualizar o ano lectivo activo.");
        }
      } else {
        const { data: created, error } = await db
          .from("academic_years")
          .insert({
            school_id: membership.schoolId,
            name: data.yearName,
            starts_on: data.startsOn,
            ends_on: data.endsOn,
            status: "active",
            created_by: context.userId,
            updated_by: context.userId,
          })
          .select("id")
          .single();
        if (error) {
          throw publicDatabaseError(error, "Não foi possível criar o ano lectivo.");
        }
        academicYearId = String(created.id);
      }
    }

    if (!academicYearId) throw new Error("Não foi possível resolver o ano lectivo.");

    const { data: existingTerms, error: existingError } = await db
      .from("terms")
      .select("id, sequence")
      .eq("school_id", membership.schoolId)
      .eq("academic_year_id", academicYearId);
    if (existingError) {
      throw publicDatabaseError(existingError, "Não foi possível validar os trimestres existentes.");
    }

    const bySequence = new Map<number, string>();
    for (const term of existingTerms ?? []) {
      const sequence = Number(term.sequence);
      if (bySequence.has(sequence)) {
        throw new Error(
          `Existem trimestres duplicados na sequência ${sequence}. Corrija os dados antes de continuar.`,
        );
      }
      bySequence.set(sequence, String(term.id));
    }

    for (const term of [...data.terms].sort((a, b) => a.sequence - b.sequence)) {
      const existingId = bySequence.get(term.sequence);
      if (existingId) {
        const { error } = await db
          .from("terms")
          .update({
            name: term.name,
            starts_on: term.startsOn,
            ends_on: term.endsOn,
            updated_by: context.userId,
          })
          .eq("id", existingId)
          .eq("school_id", membership.schoolId)
          .eq("academic_year_id", academicYearId);
        if (error) {
          throw publicDatabaseError(error, `Não foi possível actualizar o ${term.sequence}º trimestre.`);
        }
      } else {
        const { error } = await db.from("terms").insert({
          school_id: membership.schoolId,
          academic_year_id: academicYearId,
          name: term.name,
          sequence: term.sequence,
          starts_on: term.startsOn,
          ends_on: term.endsOn,
          created_by: context.userId,
          updated_by: context.userId,
        });
        if (error) {
          throw publicDatabaseError(error, `Não foi possível criar o ${term.sequence}º trimestre.`);
        }
      }
    }

    return { academicYearId, savedTerms: 3 };
  });

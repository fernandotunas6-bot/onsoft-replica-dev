import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";
import type { ApplicationRole } from "@/features/auth/access-policy";
import {
  analyzeImportFileInputSchema,
  commitImportBatchSchema,
  createImportJobSchema,
  downloadOfficialTemplateSchema,
  exportSchoolDataSchema,
  rollbackImportJobSchema,
  stageImportRowsInputSchema,
  updateStagingRowSchema,
  type ImportJobRecord,
  type ImportModule,
  type ImportRowRecord,
} from "./schemas";
import { suggestModule } from "./engine/suggest";
import { getImporter, isModuleImplemented } from "./engine/registry";
import type { ImportCommitContext } from "./engine/types";

/**
 * Quem pode importar cada módulo — espelha as responsabilidades já usadas
 * no resto do SIGA (ver requireSgaWriter em people/students/finance server.ts).
 * Módulos financeiros exigem Tesouraria; o resto exige Secretaria.
 */
function rolesForModule(module: ImportModule): ApplicationRole[] {
  if (["propinas", "pagamentos", "dividas", "historico_financeiro"].includes(module)) {
    return ["Administrador", "Tesouraria"];
  }
  return ["Administrador", "Secretaria"];
}

async function loadJobById(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  jobId: string,
): Promise<ImportJobRecord> {
  const { data: job, error } = await db.from("import_jobs").select("*").eq("id", jobId).single();
  if (error || !job) throw new Error("Processo de importação não encontrado.");
  return job as ImportJobRecord;
}

function requireJobOwnership(job: ImportJobRecord, schoolId: string): ImportJobRecord {
  if (job.school_id !== schoolId) {
    throw new Error("Este processo de importação pertence a outra escola.");
  }
  return job;
}

/**
 * Alguns endpoints só recebem `job_id` (não sabem à partida o módulo, e por
 * isso não sabem que papéis exigir). Carrega o job primeiro — sem ainda
 * confiar nele — só para saber o módulo, faz o gate de permissão correcto
 * para ESSE módulo, e só depois confirma que o job pertence à escola do
 * utilizador autenticado.
 */
async function loadJobWithModuleGate(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  sessionSupabase: Parameters<typeof requireSgaWriter>[0],
  userId: string,
  jobId: string,
) {
  const job = await loadJobById(db, jobId);
  const membership = await requireSgaWriter(sessionSupabase, userId, rolesForModule(job.module));
  requireJobOwnership(job, membership.schoolId);
  return { job, membership };
}

function base64ToBuffer(base64: string): Buffer {
  const commaIdx = base64.indexOf(",");
  const raw =
    commaIdx >= 0 && base64.slice(0, commaIdx).includes("base64")
      ? base64.slice(commaIdx + 1)
      : base64;
  return Buffer.from(raw, "base64");
}

/** Passo 1 — só analisa o ficheiro (folhas, cabeçalhos, sugestão de módulo). Nada é gravado. */
export const analyzeImportFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => analyzeImportFileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    // Só membros com papel de importação podem analisar ficheiros (evita abuso anónimo autenticado).
    await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Tesouraria",
    ]);
    const { parseImportFile } = await import("./engine/parse");
    const buffer = base64ToBuffer(data.file_base64);
    if (buffer.byteLength > 25 * 1024 * 1024) {
      throw new Error("Ficheiro demasiado grande (máximo 25 MB).");
    }
    const parsed = await parseImportFile(buffer, data.file_name);
    return {
      sheets: parsed.sheets.map((sheet) => {
        const suggestion = suggestModule(sheet.headers);
        return {
          name: sheet.name,
          headers: sheet.headers,
          row_count: sheet.rows.length,
          rows: sheet.rows,
          suggested_module: suggestion.module,
          suggested_module_score: suggestion.score,
        };
      }),
    };
  });

export const createImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createImportJobSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(
      context.supabase,
      context.userId,
      rolesForModule(data.module),
    );
    if (!isModuleImplemented(data.module)) {
      throw new Error(
        `O módulo "${data.module}" ainda não está disponível para importação nesta versão do motor.`,
      );
    }
    const db = await loadSgaAdminClient();

    if (data.academic_year_id) {
      const { data: year } = await db
        .from("academic_years")
        .select("id")
        .eq("id", data.academic_year_id)
        .eq("school_id", membership.schoolId)
        .maybeSingle();
      if (!year) throw new Error("Ano lectivo inválido para esta escola.");
    }

    const { data: job, error } = await db
      .from("import_jobs")
      .insert({
        school_id: membership.schoolId,
        academic_year_id: data.academic_year_id ?? null,
        user_id: context.userId,
        module: data.module,
        file_name: data.file_name,
        total_rows: data.total_rows,
        status: "uploaded",
      })
      .select("*")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o processo de importação.");
    return job as ImportJobRecord;
  });

export const listImportJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("import_jobs")
      .select("*")
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw publicDatabaseError(error, "Não foi possível listar as importações.");
    return (data ?? []) as ImportJobRecord[];
  });

/** Passo 4 — normaliza + valida (analyzeRow) + grava em staging, em lotes. */
export const stageImportRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => stageImportRowsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const db = await loadSgaAdminClient();
    const { job, membership } = await loadJobWithModuleGate(
      db,
      context.supabase,
      context.userId,
      data.job_id,
    );
    const importer = getImporter(job.module);
    const cache = await importer.loadRefCache({
      db,
      schoolId: membership.schoolId,
      academicYearId: job.academic_year_id ?? null,
    });

    const { count: existingCount } = await db
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_job_id", job.id);
    const startingRowNumber = existingCount ?? 0;

    const staged = data.rows.map((raw, idx) => {
      const normalized: Record<string, unknown> = {};
      for (const [sourceHeader, targetKey] of Object.entries(data.column_mapping)) {
        if (targetKey === "ignore" || !targetKey) continue;
        normalized[targetKey] = raw[sourceHeader];
      }
      const analysis = importer.analyzeRow(normalized, cache);
      return {
        import_job_id: job.id,
        sheet_name: data.sheet_name,
        row_number: startingRowNumber + idx + 1,
        raw_data: raw,
        normalized_data: normalized,
        status: analysis.status,
        warnings: analysis.warnings,
        errors: analysis.errors,
        duplicate_of: analysis.duplicate_of ?? null,
      };
    });

    const CHUNK = 500;
    for (let i = 0; i < staged.length; i += CHUNK) {
      const { error } = await db.from("import_rows").insert(staged.slice(i, i + CHUNK));
      if (error) throw publicDatabaseError(error, "Não foi possível gravar as linhas em staging.");
    }

    const counts = staged.reduce(
      (acc, row) => {
        if (row.status === "error") acc.invalid += 1;
        else if (row.status === "duplicate") acc.duplicate += 1;
        else acc.valid += 1;
        return acc;
      },
      { valid: 0, invalid: 0, duplicate: 0 },
    );

    const { error: updateError } = await db
      .from("import_jobs")
      .update({
        total_rows: startingRowNumber + staged.length,
        valid_rows: job.valid_rows + counts.valid,
        invalid_rows: job.invalid_rows + counts.invalid,
        duplicate_rows: job.duplicate_rows + counts.duplicate,
        status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (updateError)
      throw publicDatabaseError(updateError, "Não foi possível actualizar o processo.");

    return {
      staged: staged.length,
      ...counts,
      total_valid: job.valid_rows + counts.valid,
      total_invalid: job.invalid_rows + counts.invalid,
      total_duplicate: job.duplicate_rows + counts.duplicate,
    };
  });

export const listStagingRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const parsed = input as {
      job_id: string;
      page?: number;
      page_size?: number;
      status_filter?: string;
    };
    if (!parsed?.job_id) throw new Error("job_id é obrigatório.");
    return {
      job_id: parsed.job_id,
      page: parsed.page ?? 1,
      page_size: Math.min(parsed.page_size ?? 50, 200),
      status_filter: parsed.status_filter,
    };
  })
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const db = await loadSgaAdminClient();
    await loadJobWithModuleGate(db, context.supabase, context.userId, data.job_id);

    let query = db
      .from("import_rows")
      .select("*", { count: "exact" })
      .eq("import_job_id", data.job_id);
    if (data.status_filter && data.status_filter !== "todos") {
      query = query.eq("status", data.status_filter);
    }
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    const {
      data: rows,
      count,
      error,
    } = await query.order("row_number", { ascending: true }).range(from, to);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as linhas de staging.");
    return { rows: (rows ?? []) as ImportRowRecord[], total: count ?? 0 };
  });

export const updateStagingRowField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateStagingRowSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const db = await loadSgaAdminClient();

    const { data: row, error: fetchErr } = await db
      .from("import_rows")
      .select("*")
      .eq("id", data.row_id)
      .single();
    if (fetchErr || !row) throw new Error("Linha de staging não encontrada.");

    const { job, membership } = await loadJobWithModuleGate(
      db,
      context.supabase,
      context.userId,
      row.import_job_id,
    );

    const normalized = { ...row.normalized_data, [data.field_name]: data.new_value };
    const importer = getImporter(job.module);
    const cache = await importer.loadRefCache({
      db,
      schoolId: membership.schoolId,
      academicYearId: job.academic_year_id ?? null,
    });
    const analysis = importer.analyzeRow(normalized, cache);

    const { error } = await db
      .from("import_rows")
      .update({
        normalized_data: normalized,
        status: analysis.status,
        warnings: analysis.warnings,
        errors: analysis.errors,
        duplicate_of: analysis.duplicate_of ?? null,
      })
      .eq("id", data.row_id);
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a linha de staging.");
    return { status: analysis.status };
  });

/**
 * Processa UM lote de linhas ainda não importadas. Chamado repetidamente
 * pelo cliente (progresso real + retomável: se a chamada anterior falhar a
 * meio, as linhas já com status='imported' não são reprocessadas).
 */
export const commitImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => commitImportBatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const db = await loadSgaAdminClient();
    const { job, membership } = await loadJobWithModuleGate(
      db,
      context.supabase,
      context.userId,
      data.job_id,
    );
    const importer = getImporter(job.module);

    const PENDING_STATUSES = [
      "valid",
      "warning",
      "duplicate",
      "will_insert",
      "will_update",
    ] as const;

    let pendingQuery = db
      .from("import_rows")
      .select("*")
      .eq("import_job_id", job.id)
      .in("status", PENDING_STATUSES)
      .order("row_number", { ascending: true })
      .limit(data.batch_size);
    // dry_run nunca muda o status das linhas, por isso pagina por row_number
    // (senão repetiria sempre o mesmo primeiro lote).
    if (data.dry_run && data.after_row_number > 0) {
      pendingQuery = pendingQuery.gt("row_number", data.after_row_number);
    }
    const { data: pendingRows, error: pendingError } = await pendingQuery;
    if (pendingError)
      throw publicDatabaseError(pendingError, "Não foi possível carregar linhas para importar.");

    const { count: remainingAfterThis } = await db
      .from("import_rows")
      .select("id", { count: "exact", head: true })
      .eq("import_job_id", job.id)
      .in("status", PENDING_STATUSES)
      .gt("row_number", data.dry_run ? data.after_row_number : 0);

    if (!data.dry_run && job.status !== "importing") {
      await db
        .from("import_jobs")
        .update({ status: "importing", started_at: job.started_at ?? new Date().toISOString() })
        .eq("id", job.id);
    }

    const cache = await importer.loadRefCache({
      db,
      schoolId: membership.schoolId,
      academicYearId: job.academic_year_id ?? null,
    });
    const commitCtx: ImportCommitContext = {
      db,
      sessionSupabase: context.supabase,
      schoolId: membership.schoolId,
      academicYearId: job.academic_year_id ?? null,
      userId: context.userId,
      duplicateStrategy: data.duplicate_strategy,
      dryRun: data.dry_run,
    };

    let inserted = 0;
    let updated = 0;
    let ignored = 0;
    let failed = 0;
    const allAudits: Array<Record<string, unknown>> = [];

    for (const row of pendingRows ?? []) {
      const result = await importer.commitRow(
        row.normalized_data as Record<string, unknown>,
        commitCtx,
        cache,
      );
      if (result.status === "imported") inserted += 1;
      else if (result.status === "will_update") updated += 1;
      else if (result.status === "ignored") ignored += 1;
      else if (result.status === "error") failed += 1;

      if (!data.dry_run) {
        await db
          .from("import_rows")
          .update({
            status: result.status,
            target_record_id: result.target_record_id ?? null,
            warnings: result.warnings,
            errors: result.errors,
          })
          .eq("id", row.id);
        for (const audit of result.audits) {
          allAudits.push({ import_job_id: job.id, row_id: row.id, ...audit });
        }
      }
    }

    if (allAudits.length > 0) {
      await db.from("import_audits").insert(allAudits);
    }

    const remaining = (remainingAfterThis ?? 0) - (pendingRows?.length ?? 0);
    const completed = !data.dry_run && remaining <= 0;

    if (!data.dry_run) {
      const { data: currentJob } = await db
        .from("import_jobs")
        .select("inserted_rows, updated_rows, ignored_rows")
        .eq("id", job.id)
        .single();
      await db
        .from("import_jobs")
        .update({
          inserted_rows: (currentJob?.inserted_rows ?? 0) + inserted,
          updated_rows: (currentJob?.updated_rows ?? 0) + updated,
          ignored_rows: (currentJob?.ignored_rows ?? 0) + ignored,
          status: completed ? "completed" : "importing",
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", job.id);
    }

    const lastRow = (pendingRows ?? [])[pendingRows && pendingRows.length > 0 ? pendingRows.length - 1 : -1];
    return {
      processed: pendingRows?.length ?? 0,
      remaining: Math.max(remaining, 0),
      inserted,
      updated,
      ignored,
      failed,
      completed,
      next_after_row_number: data.dry_run ? (lastRow?.row_number ?? data.after_row_number) : 0,
    };
  });

const ROLLBACK_TABLES = new Set([
  "people",
  "students",
  "student_guardians",
  "teachers",
  "class_groups",
  "enrollments",
  "grade_scores",
]);

export const rollbackImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => rollbackImportJobSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const db = await loadSgaAdminClient();
    const { job } = await loadJobWithModuleGate(db, context.supabase, context.userId, data.job_id);

    const { data: audits, error: auditErr } = await db
      .from("import_audits")
      .select("*")
      .eq("import_job_id", job.id)
      .order("created_at", { ascending: false });
    if (auditErr) throw publicDatabaseError(auditErr, "Não foi possível carregar a auditoria.");

    let reverted = 0;
    let failed = 0;
    let skipped = 0;

    for (const audit of audits ?? []) {
      if (!ROLLBACK_TABLES.has(audit.table_name)) {
        skipped += 1;
        continue;
      }

      const beforeData = (audit.before_data ?? null) as Record<string, unknown> | null;
      const afterData = (audit.after_data ?? null) as Record<string, unknown> | null;
      const auditedSchoolId = String(afterData?.["school_id"] ?? beforeData?.["school_id"] ?? "");
      if (auditedSchoolId && auditedSchoolId !== job.school_id) {
        failed += 1;
        continue;
      }

      try {
        let operationError: { message?: string } | null = null;

        if (audit.table_name === "student_guardians") {
          const studentId = String(afterData?.["student_id"] ?? beforeData?.["student_id"] ?? "");
          const guardianPersonId = String(
            afterData?.["guardian_person_id"] ?? beforeData?.["guardian_person_id"] ?? "",
          );
          if (!studentId || !guardianPersonId) {
            failed += 1;
            continue;
          }

          if (audit.action_type === "inserted") {
            const result = await db
              .from("student_guardians")
              .delete()
              .eq("school_id", job.school_id)
              .eq("student_id", studentId)
              .eq("guardian_person_id", guardianPersonId);
            operationError = result.error;
          } else if (audit.action_type === "updated" && beforeData) {
            const safeBefore = { ...beforeData, school_id: job.school_id };
            const result = await db
              .from("student_guardians")
              .update(safeBefore)
              .eq("school_id", job.school_id)
              .eq("student_id", studentId)
              .eq("guardian_person_id", guardianPersonId);
            operationError = result.error;
          } else {
            skipped += 1;
            continue;
          }
        } else if (audit.action_type === "inserted") {
          const result = await db
            .from(audit.table_name)
            .delete()
            .eq("id", audit.target_id)
            .eq("school_id", job.school_id);
          operationError = result.error;
        } else if (audit.action_type === "updated" && beforeData) {
          const safeBefore = { ...beforeData, school_id: job.school_id };
          delete safeBefore["id"];
          const result = await db
            .from(audit.table_name)
            .update(safeBefore)
            .eq("id", audit.target_id)
            .eq("school_id", job.school_id);
          operationError = result.error;
        } else {
          skipped += 1;
          continue;
        }

        if (operationError) {
          failed += 1;
          continue;
        }
        reverted += 1;
      } catch {
        failed += 1;
      }
    }

    if (failed === 0) {
      const { error: statusError } = await db
        .from("import_jobs")
        .update({ status: "rolled_back", updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("school_id", job.school_id);
      if (statusError) {
        throw publicDatabaseError(statusError, "Dados revertidos, mas falhou a actualização do processo.");
      }
    }

    return {
      revertedCount: reverted,
      failedCount: failed,
      skippedCount: skipped,
      completed: failed === 0,
    };
  });

export function generateErrorReportCsv(rows: ImportRowRecord[]): string {
  const invalidRows = rows.filter(
    (r) => r.status === "error" || r.status === "duplicate" || r.errors.length > 0,
  );
  let csv = "Folha;Linha;Dados_Originais;Estado;Erros;Avisos\n";
  for (const r of invalidRows) {
    const rawStr = JSON.stringify(r.raw_data).replace(/;/g, ",");
    csv += `${r.sheet_name};${r.row_number};"${rawStr}";${r.status};"${(r.errors ?? []).join(" | ")}";"${(r.warnings ?? []).join(" | ")}"\n`;
  }
  return csv;
}

/** Gera e descarrega o modelo Excel (.xlsx) profissional de 6 abas para o módulo. */
export const downloadOfficialExcelTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => downloadOfficialTemplateSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Tesouraria",
    ]);
    const { buildOfficialExcelTemplate } = await import("./engine/excel-template-builder");
    const buffer = await buildOfficialExcelTemplate(data.module);
    const fileName = `Modelo_${data.module.toUpperCase()}_SIGA.xlsx`;
    return {
      fileName,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: buffer.toString("base64"),
    };
  });

/** Exporta dados escolares em formato Humano ou SIGA Exchange reimportável. */
export const exportSchoolDataFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => exportSchoolDataSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const db = await loadSgaAdminClient();
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
      "Tesouraria",
    ]);

    // Carregar nome da escola
    const { data: school } = await db
      .from("schools")
      .select("name")
      .eq("id", membership.schoolId)
      .maybeSingle();

    const { exportSchoolData } = await import("./export-engine");
    const result = await exportSchoolData(db, {
      schoolId: membership.schoolId,
      schoolName: school?.name || "Escola",
      academicYearId: data.academic_year_id,
      classGroupId: data.class_group_id,
      modules: data.modules,
      mode: data.mode,
    });

    return {
      fileName: result.fileName,
      mimeType: result.mimeType,
      base64: result.buffer.toString("base64"),
      recordCount: result.recordCount,
      manifest: result.manifest,
    };
  });


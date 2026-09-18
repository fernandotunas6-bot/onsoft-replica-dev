import ExcelJS from "exceljs";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportModule } from "./schemas";
import { FIELD_CATALOG } from "./engine/field-catalog";

export type ExportMode = "human" | "siga_exchange";

export interface ExportFilterOptions {
  schoolId: string;
  schoolName: string;
  academicYearId?: string | null;
  academicYearLabel?: string;
  classGroupId?: string | null;
  modules: ImportModule[];
  mode: ExportMode;
}

export interface ExportResult {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  manifest?: Record<string, unknown>;
  recordCount: number;
}

/**
 * Motor oficial de exportação de dados escolares do SIGA.
 * Suporta modo Humano (formatado para leitura) e SIGA Exchange (reimportável com 00_MANIFESTO).
 */
export async function exportSchoolData(
  db: SupabaseClient,
  options: ExportFilterOptions,
): Promise<ExportResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SIGA — Sistema Integrado de Gestão Académica";
  workbook.lastModifiedBy = "SIGA Data Exchange Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  const counts: Record<string, number> = {};
  let totalRecords = 0;

  // ---------------------------------------------------------------------------
  // 1. CARREGAMENTO E POPULAÇÃO DOS MÓDULOS SELECIONADOS
  // ---------------------------------------------------------------------------
  for (const mod of options.modules) {
    if (mod === "alunos") {
      const query = db
        .from("students")
        .select(
          `
          id,
          student_number,
          people!inner(
            full_name,
            national_id,
            gender,
            date_of_birth,
            phone,
            email,
            address
          ),
          enrollments(
            id,
            status,
            class_groups(name)
          )
        `,
        )
        .eq("school_id", options.schoolId)
        .is("deleted_at", null);

      const { data: students } = await query;
      const rows = students || [];
      counts["alunos"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("ALUNOS", {
        properties: { tabColor: { argb: "FF059669" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Nº de Processo / Nº Aluno",
        "Nome Completo do Aluno",
        "Bilhete de Identidade / Cédula",
        "Gênero / Sexo",
        "Data de Nascimento",
        "Telefone / Telemóvel",
        "Correio Electrónico (E-mail)",
        "Residência / Bairro",
        "Turma de Inscrição / Alocação",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const s of rows) {
        const p = Array.isArray(s.people) ? s.people[0] : s.people;
        const enr = s.enrollments && s.enrollments.length > 0 ? s.enrollments[0] : null;
        const cg = enr?.class_groups as
          { name?: string | null } | { name?: string | null }[] | null | undefined;
        const className = Array.isArray(cg) ? cg[0]?.name : cg?.name;

        sheet.addRow([
          s.student_number || "",
          p?.full_name || "",
          p?.national_id || "",
          p?.gender || "",
          p?.date_of_birth || "",
          p?.phone || "",
          p?.email || "",
          p?.address || "",
          className || "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "professores") {
      const { data: teachers } = await db
        .from("teachers")
        .select(
          `
          id,
          employee_number,
          specialty,
          people!inner(
            full_name,
            national_id,
            gender,
            phone,
            email
          )
        `,
        )
        .eq("school_id", options.schoolId)
        .is("deleted_at", null);

      const rows = teachers || [];
      counts["professores"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("PROFESSORES", {
        properties: { tabColor: { argb: "FF2563EB" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Nome Completo do Docente",
        "Nº de Agente / Registo Docente",
        "Bilhete de Identidade",
        "Gênero / Sexo",
        "Telefone de Contacto",
        "Correio Electrónico (E-mail)",
        "Especialidade / Formação",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const t of rows) {
        const p = Array.isArray(t.people) ? t.people[0] : t.people;
        sheet.addRow([
          p?.full_name || "",
          t.employee_number || "",
          p?.national_id || "",
          p?.gender || "",
          p?.phone || "",
          p?.email || "",
          t.specialty || "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "turmas") {
      let query = db
        .from("class_groups")
        .select(
          `
          id,
          name,
          code,
          shift,
          capacity,
          room,
          grade_levels(name)
        `,
        )
        .eq("school_id", options.schoolId)
        .is("deleted_at", null);

      if (options.academicYearId) {
        query = query.eq("academic_year_id", options.academicYearId);
      }

      const { data: classes } = await query;
      const rows = classes || [];
      counts["turmas"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("TURMAS", {
        properties: { tabColor: { argb: "FF7C3AED" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Nome da Turma",
        "Código da Turma",
        "Classe / Grau",
        "Turno / Período",
        "Sala de Aula",
        "Lotação / Capacidade",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const c of rows) {
        const gl = Array.isArray(c.grade_levels) ? c.grade_levels[0] : c.grade_levels;
        sheet.addRow([
          c.name || "",
          c.code || "",
          gl?.name || "",
          c.shift || "",
          c.room || "",
          c.capacity != null ? c.capacity : "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "matriculas") {
      let query = db
        .from("enrollments")
        .select(
          `
          id,
          status,
          created_at,
          students!inner(
            student_number,
            people!inner(full_name)
          ),
          class_groups!inner(name)
        `,
        )
        .eq("school_id", options.schoolId)
        .is("deleted_at", null);

      if (options.academicYearId) {
        query = query.eq("academic_year_id", options.academicYearId);
      }

      const { data: enrollments } = await query;
      const rows = enrollments || [];
      counts["matriculas"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("MATRICULAS", {
        properties: { tabColor: { argb: "FFD97706" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Identificador do Aluno (Nº Processo, BI ou Nome)",
        "Nome da Turma",
        "Data da Matrícula",
        "Estado da Matrícula",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const enr of rows) {
        const std = Array.isArray(enr.students) ? enr.students[0] : enr.students;
        const cg = Array.isArray(enr.class_groups) ? enr.class_groups[0] : enr.class_groups;
        const dateStr = enr.created_at ? enr.created_at.slice(0, 10) : "";

        sheet.addRow([std?.student_number || "", cg?.name || "", dateStr, enr.status || "active"]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "pessoas") {
      const { data: people } = await db
        .from("people")
        .select("id, full_name, national_id, gender, date_of_birth, phone, email, address")
        .eq("school_id", options.schoolId)
        .is("deleted_at", null);

      const rows = people || [];
      counts["pessoas"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("PESSOAS", {
        properties: { tabColor: { argb: "FF0284C7" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Nome Completo",
        "Bilhete de Identidade / Cédula",
        "Gênero / Sexo",
        "Data de Nascimento",
        "Telefone de Contacto",
        "Correio Electrónico (E-mail)",
        "Endereço / Residência",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const p of rows) {
        sheet.addRow([
          p.full_name || "",
          p.national_id || "",
          p.gender || "",
          p.date_of_birth || "",
          p.phone || "",
          p.email || "",
          p.address || "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "disciplinas") {
      const { data: subjects } = await db
        .from("subjects")
        .select("id, name, code, short_name, workload_hours")
        .eq("school_id", options.schoolId)
        .is("deleted_at", null);

      const rows = subjects || [];
      counts["disciplinas"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("DISCIPLINAS", {
        properties: { tabColor: { argb: "FFE11D48" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Nome da Disciplina",
        "Código / Sigla",
        "Abreviatura",
        "Carga Horária (Horas)",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const sub of rows) {
        sheet.addRow([
          sub.name || "",
          sub.code || "",
          sub.short_name || "",
          sub.workload_hours != null ? sub.workload_hours : "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "pagamentos" || mod === "propinas") {
      const { data: invoices } = await db
        .from("finance_invoices")
        .select(
          `
          id,
          invoice_number,
          amount,
          amount_paid,
          status,
          due_date,
          paid_at,
          payment_channel,
          students(
            student_number,
            people(full_name)
          )
        `,
        )
        .eq("school_id", options.schoolId)
        .is("deleted_at", null);

      const rows = invoices || [];
      counts[mod] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet(mod === "propinas" ? "PROPINAS" : "PAGAMENTOS", {
        properties: { tabColor: { argb: "FFD97706" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Nº da Fatura / Recibo",
        "Nº de Processo do Aluno",
        "Nome do Aluno",
        "Valor Total (AOA)",
        "Valor Pago (AOA)",
        "Estado da Fatura",
        "Data de Vencimento",
        "Data de Liquidação",
        "Canal de Pagamento",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const inv of rows) {
        const std = Array.isArray(inv.students) ? inv.students[0] : inv.students;
        const p = std?.people ? (Array.isArray(std.people) ? std.people[0] : std.people) : null;
        sheet.addRow([
          inv.invoice_number || "",
          std?.student_number || "",
          p?.full_name || "",
          inv.amount != null ? inv.amount : "",
          inv.amount_paid != null ? inv.amount_paid : "",
          inv.status || "",
          inv.due_date || "",
          inv.paid_at ? inv.paid_at.slice(0, 10) : "",
          inv.payment_channel || "",
        ]);
      }
      autoFitColumns(sheet);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. MODO SIGA EXCHANGE: ABA 00_MANIFESTO E CHECKSUM
  // ---------------------------------------------------------------------------
  let manifestData: Record<string, unknown> | undefined;

  if (options.mode === "siga_exchange") {
    const rawBuffer = await workbook.xlsx.writeBuffer();
    const hash = crypto.createHash("sha256").update(Buffer.from(rawBuffer)).digest("hex");

    manifestData = {
      format: "SIGA-EXCHANGE",
      version: "1.0",
      exported_at: new Date().toISOString(),
      school_id: options.schoolId,
      school_name: options.schoolName,
      academic_year_id: options.academicYearId || null,
      academic_year_label: options.academicYearLabel || null,
      modules: options.modules,
      record_counts: counts,
      total_records: totalRecords,
      checksum_sha256: hash,
    };

    // Inserir aba 00_MANIFESTO na primeira posição
    const sheetManifest = workbook.addWorksheet("00_MANIFESTO", {
      properties: { tabColor: { argb: "FF111827" } },
    });
    sheetManifest.views = [{ showGridLines: true }];
    sheetManifest.getColumn(1).width = 25;
    sheetManifest.getColumn(2).width = 60;

    const mTitle = sheetManifest.addRow(["MANIFESTO DE INTERCÂMBIO", "SIGA DATA EXCHANGE ENGINE"]);
    mTitle.font = { bold: true, size: 12, color: { argb: "FF1E3A8A" } };
    sheetManifest.addRow([]);

    Object.entries(manifestData).forEach(([key, val]) => {
      sheetManifest.addRow([
        key.toUpperCase(),
        typeof val === "object" ? JSON.stringify(val) : String(val ?? "—"),
      ]);
    });
  }

  const finalBuffer = await workbook.xlsx.writeBuffer();
  const dateTag = new Date().toISOString().slice(0, 10);
  const cleanSchool = options.schoolName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20);
  const fileName =
    options.mode === "siga_exchange"
      ? `SIGA_EXCHANGE_${cleanSchool}_${dateTag}.xlsx`
      : `SIGA_Exportacao_${cleanSchool}_${dateTag}.xlsx`;

  return {
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(finalBuffer),
    manifest: manifestData,
    recordCount: totalRecords,
  };
}

function styleHeaderRow(row: ExcelJS.Row, mode: ExportMode) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: mode === "siga_exchange" ? "FF1E3A8A" : "FF374151" },
    };
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 11,
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
}

function autoFitColumns(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let max = 15;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const val = cell.value ? String(cell.value) : "";
      if (val.length > max) max = Math.min(val.length + 4, 40);
    });
    col.width = max;
  });
}

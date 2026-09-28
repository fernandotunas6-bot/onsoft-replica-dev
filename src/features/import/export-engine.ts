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

/** O PostgREST devolve um embed como objecto ou como array de um, conforme a cardinalidade. */
function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type PersonEmbed = { full_name?: string | null; national_id?: string | null };
type StudentEmbed = { student_number?: string | null; people?: PersonEmbed | PersonEmbed[] | null };
type EnrollmentEmbed = { students?: StudentEmbed | StudentEmbed[] | null };
type ContractEmbed = { enrollments?: EnrollmentEmbed | EnrollmentEmbed[] | null };

/**
 * O aluno de uma fatura. `finance_invoices` não tem `student_id` nem relação directa com
 * `students`: a ligação é `finance_contracts → enrollments → students`. O embed
 * `students(…)` que aqui estava não existe como relação, pelo que o PostgREST recusava a
 * consulta inteira e a exportação saía vazia.
 */
function studentOfInvoice(invoice: {
  finance_contracts?: ContractEmbed | ContractEmbed[] | null;
}): StudentEmbed | null {
  const contract = first(invoice.finance_contracts);
  const enrollment = first(contract?.enrollments);
  return first(enrollment?.students);
}

/**
 * Quanto foi liquidado, quando e por que via. Não há `amount_paid`/`paid_at`/
 * `payment_channel` em `finance_invoices` — o pagamento são linhas de `finance_receipts`,
 * e uma fatura pode ter mais do que uma.
 */
function settlementOfInvoice(invoice: { finance_receipts?: unknown }) {
  const raw = invoice.finance_receipts;
  const receipts = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<{
    amount?: number | string;
    paid_on?: string;
    payment_method?: string;
  }>;
  const emitidos = receipts.filter((r) => r.paid_on);
  const paid = receipts.reduce((total, r) => total + Number(r.amount || 0), 0);
  const ultimo = emitidos.sort((a, b) => String(a.paid_on).localeCompare(String(b.paid_on))).at(-1);
  return {
    paid: paid > 0 ? paid : "",
    lastPaidOn: ultimo?.paid_on ? String(ultimo.paid_on).slice(0, 10) : "",
    method: ultimo?.payment_method || "",
  };
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

  // Não permitir exportação silenciosamente parcial: um módulo sem rotina de
  // exportação específica não pode produzir um ficheiro que pareça reimportável.
  const supportedExportModules = new Set<ImportModule>([
    "pessoas",
    "alunos",
    "professores",
    "turmas",
    "matriculas",
    "disciplinas",
    "pagamentos",
    "propinas",
    "inscricoes",
    "avaliacoes",
    "historico_academico",
    "historico_financeiro",
    "presencas",
    "funcionarios",
    "classes",
    "salas",
    "horarios",
    "dividas",
  ]);
  const unsupportedModules = options.modules.filter((mod) => !supportedExportModules.has(mod));
  if (unsupportedModules.length) {
    throw new Error(
      `Exportação bloqueada: os módulos ${unsupportedModules.join(", ")} ainda não possuem uma rotina de exportação bidireccional validada. Nenhum ficheiro parcial será gerado.`,
    );
  }

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
            sex,
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
        const cg = enr?.class_groups;
        const className = Array.isArray(cg) ? (cg[0] as any)?.name : (cg as any)?.name;

        sheet.addRow([
          s.student_number || "",
          p?.full_name || "",
          p?.national_id || "",
          p?.sex || "",
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
          highest_qualification,
          people!inner(
            full_name,
            national_id,
            sex,
            phone,
            email
          )
        `,
        )
        .eq("school_id", options.schoolId);
      // `teachers` não tem `deleted_at`: filtrar por ela recusava a consulta inteira.

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
          p?.sex || "",
          p?.phone || "",
          p?.email || "",
          t.highest_qualification || "",
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
          grade_levels(name)
        `,
        )
        .eq("school_id", options.schoolId);
      // `class_groups` não tem `deleted_at`: filtrar por ela recusava a consulta inteira.

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
        .eq("school_id", options.schoolId);
      // `enrollments` não tem `deleted_at`: filtrar por ela recusava a consulta inteira.

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
        .select("id, full_name, national_id, sex, date_of_birth, phone, email, address")
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
          p.sex || "",
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
        // A coluna de carga horária é `annual_hours`.
        .select("id, name, code, short_name, annual_hours")
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
          sub.annual_hours != null ? sub.annual_hours : "",
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
          discount_amount,
          status,
          due_date,
          finance_contracts!inner(
            enrollments!inner(
              students!inner(
                student_number,
                people(full_name)
              )
            )
          ),
          finance_receipts(amount, paid_on, payment_method)
        `,
        )
        .eq("school_id", options.schoolId);
      // `finance_invoices` não tem `deleted_at`: filtrar por ela recusava a consulta inteira.

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
        const std = studentOfInvoice(inv);
        const p = first(std?.people);
        const liquidacao = settlementOfInvoice(inv);
        sheet.addRow([
          inv.invoice_number || "",
          std?.student_number || "",
          p?.full_name || "",
          inv.amount != null ? inv.amount : "",
          liquidacao.paid,
          inv.status || "",
          inv.due_date || "",
          liquidacao.lastPaidOn,
          liquidacao.method,
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "inscricoes") {
      const { data: applications } = await db
        .from("enrollment_applications")
        .select("id, full_name, status, payload, created_at, decided_at")
        .eq("school_id", options.schoolId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      const rows = applications || [];
      counts["inscricoes"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("INSCRICOES", {
        properties: { tabColor: { argb: "FF2563EB" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Nome do Candidato",
        "Estado da Candidatura",
        "Telefone",
        "E-mail",
        "Classe Pretendida",
        "Data de Submissão",
        "Data de Decisão",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const app of rows) {
        const payload = (app.payload ?? {}) as Record<string, any>;
        const person = payload.person ?? {};
        sheet.addRow([
          app.full_name || person.full_name || "",
          app.status || "",
          person.phone_primary || payload.guardianPhone || "",
          person.email || "",
          payload.grade_level || payload.desired_grade || "",
          app.created_at ? String(app.created_at).slice(0, 10) : "",
          app.decided_at ? String(app.decided_at).slice(0, 10) : "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "avaliacoes") {
      const { data: items } = await db
        .from("siga_assessment_items")
        .select("id, name, kind, component, term, max_score, assessed_on, created_at")
        .eq("school_id", options.schoolId)
        .order("created_at", { ascending: false });

      let rows = (items || []).map((item: any) => ({
        id: item.id,
        title: item.name,
        code: item.component || item.kind || "",
        max_score: item.max_score,
        weight: 1,
        term_label: item.term != null ? `${item.term}º Trimestre` : "",
        created_at: item.assessed_on || item.created_at,
      }));

      if (!rows.length) {
        const { data: gradeItems } = await db
          .from("grade_items")
          .select("id, name, code, max_score, weight, created_at")
          .eq("school_id", options.schoolId);
        rows = (gradeItems || []).map((gi: any) => ({
          id: gi.id,
          title: gi.name,
          code: gi.code,
          max_score: gi.max_score,
          weight: gi.weight,
          term_label: "",
          created_at: gi.created_at,
        }));
      }

      counts["avaliacoes"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("AVALIACOES", {
        properties: { tabColor: { argb: "FF7C3AED" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Título da Avaliação",
        "Código / Sigla",
        "Cotação Máxima",
        "Peso",
        "Trimestre / Período",
        "Data de Registo",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const item of rows) {
        sheet.addRow([
          item.title || "",
          item.code || "",
          item.max_score != null ? item.max_score : "",
          item.weight != null ? item.weight : "",
          item.term_label || "",
          item.created_at ? String(item.created_at).slice(0, 10) : "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "presencas") {
      const { data: records, error } = await db
        .from("siga_attendance_records")
        .select(
          "id, status, notes, student_id, siga_attendance_sessions!inner(class_group_id, subject_id, lesson_date)",
        )
        .eq("school_id", options.schoolId)
        .order("created_at", { ascending: true });

      if (error) {
        throw new Error(`Não foi possível exportar presenças: ${error.message}`);
      }

      const rows = records || [];
      const studentIds = [...new Set(rows.map((r: any) => String(r.student_id)))];
      const sessionRows = rows.map((r: any) =>
        Array.isArray(r.siga_attendance_sessions)
          ? r.siga_attendance_sessions[0]
          : r.siga_attendance_sessions,
      );
      const groupIds = [
        ...new Set(
          sessionRows
            .map((r: any) => r?.class_group_id)
            .filter(Boolean)
            .map(String),
        ),
      ];
      const subjectIds = [
        ...new Set(
          sessionRows
            .map((r: any) => r?.subject_id)
            .filter(Boolean)
            .map(String),
        ),
      ];

      const [{ data: students }, { data: groups }, { data: subjects }] = await Promise.all([
        studentIds.length
          ? db.from("students").select("id, student_number").in("id", studentIds)
          : Promise.resolve({ data: [], error: null } as any),
        groupIds.length
          ? db.from("class_groups").select("id, name").in("id", groupIds)
          : Promise.resolve({ data: [], error: null } as any),
        subjectIds.length
          ? db.from("subjects").select("id, name").in("id", subjectIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const studentById = new Map(
        (students || []).map((s: any) => [String(s.id), String(s.student_number || "")]),
      );
      const groupById = new Map(
        (groups || []).map((g: any) => [String(g.id), String(g.name || "")]),
      );
      const subjectById = new Map(
        (subjects || []).map((s: any) => [String(s.id), String(s.name || "")]),
      );

      counts["presencas"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("PRESENCAS", {
        properties: { tabColor: { argb: "FF0EA5E9" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Identificador do Aluno (Nº Processo, BI ou Nome)",
        "Turma",
        "Disciplina",
        "Data da Presença",
        "Estado",
        "Motivo / Observação",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      rows.forEach((record: any, index: number) => {
        const session = sessionRows[index] || {};
        sheet.addRow([
          studentById.get(String(record.student_id)) || "",
          groupById.get(String(session.class_group_id)) || "",
          subjectById.get(String(session.subject_id)) || "",
          session.lesson_date || "",
          record.status || "",
          record.notes || "",
        ]);
      });
      autoFitColumns(sheet);
    }

    if (mod === "funcionarios") {
      const { data, error } = await db
        .from("hr_employments")
        .select(
          "id, employee_number, employment_type, status, hire_date, person_id, position_id, department_id, people(full_name, national_id, phone, email), hr_positions(name), hr_departments(name)",
        )
        .eq("school_id", options.schoolId)
        .is("deleted_at", null);
      if (error) throw new Error(`Não foi possível exportar funcionários: ${error.message}`);
      const rows = data || [];
      counts["funcionarios"] = rows.length;
      totalRecords += rows.length;
      const sheet = workbook.addWorksheet("FUNCIONARIOS");
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
      const headers = [
        "Nome Completo",
        "Nº BI / Documento",
        "Nº de Funcionário / Agente",
        "Data de Admissão",
        "Cargo / Função",
        "Departamento / Sector",
        "Telefone",
        "E-mail",
        "Tipo de Contrato",
      ];
      styleHeaderRow(sheet.addRow(headers), options.mode);
      for (const r of rows) {
        const p = first(r.people as any);
        const pos = first(r.hr_positions as any);
        const dep = first(r.hr_departments as any);
        sheet.addRow([
          p?.full_name || "",
          p?.national_id || "",
          r.employee_number || "",
          r.hire_date || "",
          pos?.name || "",
          dep?.name || "",
          p?.phone || "",
          p?.email || "",
          r.employment_type || "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "classes") {
      const query = db
        .from("grade_levels")
        .select("id, code, name, sequence, program_id, programs(name, code)")
        .eq("school_id", options.schoolId);
      const { data, error } = await query;
      if (error) throw new Error(`Não foi possível exportar classes: ${error.message}`);
      const rows = data || [];
      counts["classes"] = rows.length;
      totalRecords += rows.length;
      const sheet = workbook.addWorksheet("CLASSES");
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
      styleHeaderRow(
        sheet.addRow([
          "Código da Classe",
          "Nome da Classe",
          "Curso / Especialidade",
          "Ordem / Nível",
        ]),
        options.mode,
      );
      for (const r of rows) {
        const p = first(r.programs as any);
        sheet.addRow([r.code || "", r.name || "", p?.code || p?.name || "", r.sequence ?? ""]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "cursos") {
      const { data, error } = await db
        .from("programs")
        .select("id, name, code, academic_level_id")
        .eq("school_id", options.schoolId)
        .eq("is_active", true);
      if (error) throw new Error(`Não foi possível exportar cursos: ${error.message}`);
      const rows = data || [];
      counts["cursos"] = rows.length;
      totalRecords += rows.length;
      const levelIds = [...new Set(rows.map((r: any) => String(r.academic_level_id)))];
      const { data: levels } = levelIds.length
        ? await db.from("academic_levels").select("id,name").in("id", levelIds)
        : { data: [] };
      const lm = new Map((levels || []).map((r: any) => [String(r.id), r.name]));
      const sheet = workbook.addWorksheet("CURSOS");
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
      styleHeaderRow(
        sheet.addRow(["Nome do Curso", "Código do Curso", "Nível Académico"]),
        options.mode,
      );
      for (const r of rows)
        sheet.addRow([r.name || "", r.code || "", lm.get(String(r.academic_level_id)) || ""]);
      autoFitColumns(sheet);
    }

    if (mod === "salas") {
      const { data, error } = await db
        .from("rooms")
        .select("id, code, name, capacity, room_type, campus_id")
        .eq("school_id", options.schoolId)
        .is("deleted_at", null);
      if (error) throw new Error(`Não foi possível exportar salas: ${error.message}`);
      const rows = data || [];
      counts["salas"] = rows.length;
      totalRecords += rows.length;
      const campusIds = [
        ...new Set(
          rows
            .map((r: any) => r.campus_id)
            .filter(Boolean)
            .map(String),
        ),
      ];
      const { data: campuses } = campusIds.length
        ? await db.from("campuses").select("id,name").in("id", campusIds)
        : { data: [] };
      const cm = new Map((campuses || []).map((r: any) => [String(r.id), r.name]));
      const sheet = workbook.addWorksheet("SALAS");
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
      styleHeaderRow(
        sheet.addRow([
          "Código da Sala",
          "Nome da Sala",
          "Campus / Bloco",
          "Capacidade",
          "Tipo de Espaço",
        ]),
        options.mode,
      );
      for (const r of rows)
        sheet.addRow([
          r.code || "",
          r.name || "",
          cm.get(String(r.campus_id)) || "",
          r.capacity ?? "",
          r.room_type || "",
        ]);
      autoFitColumns(sheet);
    }

    if (mod === "horarios") {
      const query = db
        .from("timetable_slots")
        .select("id,class_subject_id,weekday,starts_at,ends_at,room,status,room_id,shift_id")
        .eq("school_id", options.schoolId)
        .eq("status", "active");
      const { data, error } = await query;
      if (error) throw new Error(`Não foi possível exportar horários: ${error.message}`);
      const rows = data || [];
      counts["horarios"] = rows.length;
      totalRecords += rows.length;
      const csIds = [...new Set(rows.map((r: any) => String(r.class_subject_id)))];
      const roomIds = [
        ...new Set(
          rows
            .map((r: any) => r.room_id)
            .filter(Boolean)
            .map(String),
        ),
      ];
      const { data: css } = csIds.length
        ? await db
            .from("class_subjects")
            .select("id,class_group_id,subject_id,teacher_id")
            .in("id", csIds)
        : { data: [] };
      const groupIds = [...new Set((css || []).map((r: any) => String(r.class_group_id)))];
      const subjectIds = [...new Set((css || []).map((r: any) => String(r.subject_id)))];
      const teacherIds = [
        ...new Set(
          (css || [])
            .map((r: any) => r.teacher_id)
            .filter(Boolean)
            .map(String),
        ),
      ];
      const [{ data: groups }, { data: subjects }, { data: teachers }, { data: rooms }] =
        await Promise.all([
          groupIds.length
            ? db.from("class_groups").select("id,name,code").in("id", groupIds)
            : Promise.resolve({ data: [] as any[] }),
          subjectIds.length
            ? db.from("subjects").select("id,name,code").in("id", subjectIds)
            : Promise.resolve({ data: [] as any[] }),
          teacherIds.length
            ? db
                .from("teachers")
                .select("id,employee_number,people(full_name)")
                .in("id", teacherIds)
            : Promise.resolve({ data: [] as any[] }),
          roomIds.length
            ? db.from("rooms").select("id,name,code").in("id", roomIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
      const csm = new Map((css || []).map((r: any) => [String(r.id), r]));
      const gm = new Map((groups || []).map((r: any) => [String(r.id), r]));
      const sm = new Map((subjects || []).map((r: any) => [String(r.id), r]));
      const tm = new Map((teachers || []).map((r: any) => [String(r.id), r]));
      const rm = new Map((rooms || []).map((r: any) => [String(r.id), r]));
      const days = [
        "",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
        "Domingo",
      ];
      const sheet = workbook.addWorksheet("HORARIOS");
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
      styleHeaderRow(
        sheet.addRow([
          "Turma",
          "Disciplina",
          "Professor (Nº Agente ou BI)",
          "Dia da Semana",
          "Hora de Início",
          "Hora de Fim",
          "Sala",
        ]),
        options.mode,
      );
      for (const r of rows) {
        const cs = csm.get(String(r.class_subject_id));
        const g = gm.get(String(cs?.class_group_id));
        const s = sm.get(String(cs?.subject_id));
        const t = tm.get(String(cs?.teacher_id));
        const p = first(t?.people as any);
        const room = rm.get(String(r.room_id));
        sheet.addRow([
          g?.code || g?.name || "",
          s?.code || s?.name || "",
          t?.employee_number || p?.full_name || "",
          days[Number(r.weekday)] || String(r.weekday),
          r.starts_at || "",
          r.ends_at || "",
          room?.code || room?.name || r.room || "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "notas") {
      const scoreQuery = db
        .from("grade_scores")
        .select(
          "id,grade_item_id,enrollment_id,score,status,note,grade_items!inner(code,name,gradebooks!inner(term_id,class_subject_id,class_group_id))",
        )
        .eq("school_id", options.schoolId);
      const { data, error } = await scoreQuery;
      if (error) throw new Error(`Não foi possível exportar notas: ${error.message}`);
      const rows = data || [];
      // A nota liga-se ao diário pelo item de avaliação: `grade_scores` não
      // tem `gradebook_id` (a relação directa dava 400 no PostgREST).
      const gradebookOf = (r: any) => first(first(r.grade_items as any)?.gradebooks as any);
      counts["notas"] = rows.length;
      totalRecords += rows.length;
      const enrIds = [...new Set(rows.map((r: any) => String(r.enrollment_id)))];
      const csIds = [...new Set(rows.map((r: any) => String(gradebookOf(r)?.class_subject_id)))];
      const { data: enrollments } = enrIds.length
        ? await db.from("enrollments").select("id,student_id,class_group_id").in("id", enrIds)
        : { data: [] };
      const { data: css } = csIds.length
        ? await db.from("class_subjects").select("id,subject_id").in("id", csIds)
        : { data: [] };
      const studentIds = [...new Set((enrollments || []).map((r: any) => String(r.student_id)))];
      const subjectIds = [...new Set((css || []).map((r: any) => String(r.subject_id)))];
      const termIds = [...new Set(rows.map((r: any) => String(gradebookOf(r)?.term_id)))];
      const groupIds = [
        ...new Set((enrollments || []).map((r: any) => String(r.class_group_id))),
      ].filter((id) => id && id !== "null");
      const [{ data: students }, { data: subjects }, { data: terms }, { data: groups }] =
        await Promise.all([
          studentIds.length
            ? db.from("students").select("id,student_number").in("id", studentIds)
            : Promise.resolve({ data: [] as any[] }),
          subjectIds.length
            ? db.from("subjects").select("id,name,code").in("id", subjectIds)
            : Promise.resolve({ data: [] as any[] }),
          termIds.length
            ? db.from("terms").select("id,sequence,name").in("id", termIds)
            : Promise.resolve({ data: [] as any[] }),
          groupIds.length
            ? db.from("class_groups").select("id,code,name").in("id", groupIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
      const gm = new Map((groups || []).map((r: any) => [String(r.id), r]));
      const em = new Map((enrollments || []).map((r: any) => [String(r.id), r]));
      const cm = new Map((css || []).map((r: any) => [String(r.id), r]));
      const sm = new Map((students || []).map((r: any) => [String(r.id), r.student_number]));
      const subm = new Map((subjects || []).map((r: any) => [String(r.id), r]));
      const termm = new Map((terms || []).map((r: any) => [String(r.id), r.sequence ?? r.name]));
      const sheet = workbook.addWorksheet("NOTAS");
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
      styleHeaderRow(
        sheet.addRow([
          "Identificador do Aluno (Processo ou Nome)",
          "Turma",
          "Disciplina",
          "Trimestre / Período",
          "Código da Avaliação",
          "Nota / Média Final do Período",
          "Observação",
        ]),
        options.mode,
      );
      for (const r of rows) {
        const gb = gradebookOf(r);
        const e = em.get(String(r.enrollment_id));
        const group = gm.get(String(e?.class_group_id));
        const cs = cm.get(String(gb?.class_subject_id));
        const sub = subm.get(String(cs?.subject_id));
        const gi = first(r.grade_items as any);
        sheet.addRow([
          sm.get(String(e?.student_id)) || "",
          group?.code || group?.name || "",
          sub?.code || sub?.name || "",
          termm.get(String(gb?.term_id)) || "",
          gi?.code || "",
          r.score ?? "",
          r.note || "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "dividas") {
      const { data, error } = await db
        .from("finance_invoices")
        .select(
          "id,contract_id,fee_item_id,invoice_number,competence_month,amount,discount_amount,due_date,status,penalty_amount",
        )
        .eq("school_id", options.schoolId);
      if (error) throw new Error(`Não foi possível exportar dívidas: ${error.message}`);
      const rows = data || [];
      counts["dividas"] = rows.length;
      totalRecords += rows.length;
      const contractIds = [...new Set(rows.map((r: any) => String(r.contract_id)))];
      const feeItemIds = [...new Set(rows.map((r: any) => String(r.fee_item_id)))];
      const [{ data: contracts }, { data: feeItems }] = await Promise.all([
        contractIds.length
          ? db.from("finance_contracts").select("id,enrollment_id").in("id", contractIds)
          : Promise.resolve({ data: [] as any[] }),
        feeItemIds.length
          ? db.from("fee_items").select("id,name").in("id", feeItemIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const enrollmentIds = [
        ...new Set((contracts || []).map((r: any) => String(r.enrollment_id))),
      ];
      const { data: enrollments } = enrollmentIds.length
        ? await db.from("enrollments").select("id,student_id").in("id", enrollmentIds)
        : { data: [] };
      const studentIds = [...new Set((enrollments || []).map((r: any) => String(r.student_id)))];
      const { data: students } = studentIds.length
        ? await db.from("students").select("id,student_number").in("id", studentIds)
        : { data: [] };
      const cm = new Map((contracts || []).map((r: any) => [String(r.id), r]));
      const fm = new Map((feeItems || []).map((r: any) => [String(r.id), r.name]));
      const em = new Map((enrollments || []).map((r: any) => [String(r.id), r]));
      const stm = new Map((students || []).map((r: any) => [String(r.id), r.student_number]));
      const sheet = workbook.addWorksheet("DIVIDAS");
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
      styleHeaderRow(
        sheet.addRow([
          "Aluno (Processo ou BI)",
          "Nº da Fatura / Guia",
          "Mês / Descrição da Dívida",
          "Valor em Dívida (Kz)",
          "Data de Vencimento",
          "Estado da Cobrança",
        ]),
        options.mode,
      );
      for (const r of rows) {
        const c = cm.get(String(r.contract_id));
        const e = em.get(String(c?.enrollment_id));
        sheet.addRow([
          stm.get(String(e?.student_id)) || "",
          r.invoice_number || "",
          fm.get(String(r.fee_item_id)) || r.competence_month || "",
          r.amount ?? "",
          r.due_date || "",
          r.status || "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "historico_academico") {
      const { data: historyRows } = await db
        .from("student_academic_history")
        .select(
          `
          id,
          academic_year_label,
          grade_level,
          previous_school,
          final_average,
          outcome,
          students(student_number, people(full_name, national_id))
        `,
        )
        .eq("school_id", options.schoolId)
        .order("academic_year_label", { ascending: false });

      let rows: any[] = historyRows || [];

      if (!rows.length) {
        const { data: enrollments } = await db
          .from("enrollments")
          .select(
            `
            id,
            status,
            enrolled_on,
            students(student_number, people(full_name, national_id)),
            academic_years(name),
            class_groups(name, grade_levels(name))
          `,
          )
          .eq("school_id", options.schoolId)
          .order("enrolled_on", { ascending: false });

        rows = (enrollments || []).map((enr: any) => {
          const std = Array.isArray(enr.students) ? enr.students[0] : enr.students;
          const person = std?.people
            ? Array.isArray(std.people)
              ? std.people[0]
              : std.people
            : null;
          const year = Array.isArray(enr.academic_years)
            ? enr.academic_years[0]
            : enr.academic_years;
          const cg = Array.isArray(enr.class_groups) ? enr.class_groups[0] : enr.class_groups;
          const grade = cg?.grade_levels
            ? Array.isArray(cg.grade_levels)
              ? cg.grade_levels[0]
              : cg.grade_levels
            : null;
          return {
            id: enr.id,
            academic_year_label: year?.name || "",
            grade_level: grade?.name || "",
            previous_school: null,
            final_average: null,
            outcome: enr.status || "",
            students: {
              student_number: std?.student_number,
              people: person,
            },
          };
        });
      }

      counts["historico_academico"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("HISTORICO_ACADEMICO", {
        properties: { tabColor: { argb: "FF0F766E" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Nº Processo",
        "Nome do Aluno",
        "BI / Cédula",
        "Ano Lectivo",
        "Classe",
        "Escola de Proveniência",
        "Média Final",
        "Desfecho",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const row of rows) {
        const std = Array.isArray(row.students) ? row.students[0] : row.students;
        const person = std?.people
          ? Array.isArray(std.people)
            ? std.people[0]
            : std.people
          : null;
        sheet.addRow([
          std?.student_number || "",
          person?.full_name || "",
          person?.national_id || "",
          row.academic_year_label || "",
          row.grade_level || "",
          row.previous_school || "",
          row.final_average != null ? row.final_average : "",
          row.outcome || "",
        ]);
      }
      autoFitColumns(sheet);
    }

    if (mod === "historico_financeiro") {
      const { data: invoices } = await db
        .from("finance_invoices")
        .select(
          `
          id,
          invoice_number,
          amount,
          discount_amount,
          status,
          due_date,
          finance_contracts!inner(
            enrollments!inner(
              students!inner(
                student_number,
                people(full_name, national_id)
              )
            )
          ),
          finance_receipts(amount, paid_on, payment_method)
        `,
        )
        .eq("school_id", options.schoolId)
        // `finance_invoices` não tem `deleted_at`: filtrar por ela recusava a consulta inteira.
        .order("due_date", { ascending: false });

      const rows = invoices || [];
      counts["historico_financeiro"] = rows.length;
      totalRecords += rows.length;

      const sheet = workbook.addWorksheet("HISTORICO_FINANCEIRO", {
        properties: { tabColor: { argb: "FFB45309" } },
      });
      sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];

      const headers = [
        "Nº Fatura / Recibo",
        "Nº Processo",
        "Nome do Aluno",
        "BI / Cédula",
        "Valor Total (AOA)",
        "Valor Pago (AOA)",
        "Estado",
        "Data de Vencimento",
        "Data de Liquidação",
        "Canal",
      ];
      const hRow = sheet.addRow(headers);
      styleHeaderRow(hRow, options.mode);

      for (const inv of rows) {
        const std = studentOfInvoice(inv);
        const person = first(std?.people);
        const liquidacao = settlementOfInvoice(inv);
        sheet.addRow([
          inv.invoice_number || "",
          std?.student_number || "",
          person?.full_name || "",
          person?.national_id || "",
          inv.amount != null ? inv.amount : "",
          liquidacao.paid,
          inv.status || "",
          inv.due_date || "",
          liquidacao.lastPaidOn,
          liquidacao.method,
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

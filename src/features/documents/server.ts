import type { Json } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { loadPersonNamesById } from "@/features/people/lookup";
import { loadStudentScope } from "@/features/students/student-scope";
import baseCss from "../../../public/templates/base.css?raw";
import talaoCandidaturaHbs from "../../../public/templates/talao-candidatura.hbs?raw";
import talaoMatriculaHbs from "../../../public/templates/talao-matricula.hbs?raw";
import folhaCredenciaisHbs from "../../../public/templates/folha-credenciais.hbs?raw";
import dossieAcademicoHbs from "../../../public/templates/dossie-academico.hbs?raw";
import serviceDocumentHbs from "../../../public/templates/service-document.hbs?raw";
import historicoAcademicoIndividualHbs from "../../../public/templates/historico-academico-individual.hbs?raw";
import pautaDisciplinarHbs from "../../../public/templates/pauta-disciplinar.hbs?raw";
import pautaGeralTurmaHbs from "../../../public/templates/pauta-geral-turma.hbs?raw";
import boletimEscolarHbs from "../../../public/templates/boletim-escolar.hbs?raw";
import certificadoHabilitacoesHbs from "../../../public/templates/certificado-habilitacoes.hbs?raw";
import diarioPedagogicoProfessorHbs from "../../../public/templates/diario-pedagogico-professor.hbs?raw";
import actaConselhoNotasHbs from "../../../public/templates/acta-conselho-notas.hbs?raw";
import declaracaoNotasSimplesHbs from "../../../public/templates/declaracao-notas-simples.hbs?raw";
import relatorioValidacaoNotasHbs from "../../../public/templates/relatorio-validacao-notas.hbs?raw";
import mapaEstatisticoAproveitamentoHbs from "../../../public/templates/mapa-estatistico-aproveitamento.hbs?raw";
import {
  createDocumentRequestInputSchema,
  getPrintTemplateInputSchema,
  listDocumentsInputSchema,
  resetPrintTemplateInputSchema,
  savePrintTemplateInputSchema,
  setActivePrintTemplateInputSchema,
  updateDocumentRequestStatusInputSchema,
} from "./schemas";
import {
  isPrintTemplateKey,
  PRINT_TEMPLATE_KEYS,
  PRINT_TEMPLATE_META,
  type PrintTemplateKey,
} from "./print-catalog";
import { parsePrintSettings } from "./print-settings";
import { updateSettingsDomainValue } from "@/features/school/settings-domains";

/**
 * Há dois vocabulários de estado, e só o servidor deve conhecer os dois.
 *
 * Na base, `document_requests_status_check` admite exactamente:
 *   submitted | in_review | approved | rejected | fulfilled | cancelled
 * Na interface, os rótulos e as acções são indexados por:
 *   queued | processing | ready | delivered | rejected | cancelled
 *
 * A tradução existia só num sentido — base → interface. Faltava a inversa, e sem ela o
 * avanço de um pedido estava partido em quatro sítios ao mesmo tempo:
 *
 *   · `next_status` saía daqui em vocabulário da BASE, mas `advanceActionLabel` em
 *     documentos.tsx é indexado pelo da INTERFACE, pelo que o botão nunca encontrava o
 *     rótulo certo e mostrava sempre o genérico "Avançar";
 *   · `updateDocumentRequestStatusInputSchema` aceitava só o vocabulário da INTERFACE,
 *     por isso recusava no zod o valor que esta função lhe mandava ("in_review", "approved");
 *   · e se lá chegasse, a base recusava-o na mesma com 23514 (verificado em produção);
 *   · `documentos.tsx` dispara o download com `nextStatus === "ready"`, que nunca era
 *     verdade porque recebia "approved".
 *
 * Passa tudo a sair daqui em vocabulário da interface, e a ser traduzido de volta à
 * entrada. Quem chama nunca vê o vocabulário da base.
 */
/** Exportado para o teste que verifica que os dois vocabulários são inversos. */
export const statusToUi: Record<string, string> = {
  submitted: "queued",
  in_review: "processing",
  approved: "ready",
  fulfilled: "delivered",
  rejected: "rejected",
  cancelled: "cancelled",
};

/** Inversa de `statusToUi`. É o que faltava. */
export const uiStatusToSga: Record<string, string> = {
  queued: "submitted",
  processing: "in_review",
  ready: "approved",
  delivered: "fulfilled",
  rejected: "rejected",
  cancelled: "cancelled",
};

/**
 * Próximo passo, em vocabulário da base. `approved → fulfilled` fecha o circuito: a base
 * admite `fulfilled`, a interface já tem o rótulo "Entregar" e o estado "Emitido" para ele,
 * e sem este passo um documento aprovado nunca podia ser dado como entregue.
 */
export const nextSgaStatus: Record<string, string | null> = {
  submitted: "in_review",
  in_review: "approved",
  approved: "fulfilled",
  fulfilled: null,
  rejected: null,
  cancelled: null,
};

/** Listas de ids em blocos: um `.in()` com centenas de UUID passa o tamanho do URL. */
function idChunks(ids: readonly string[], size = 150): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

type DocumentStudentRow = { id: string; student_number: string; person_id: string };

/**
 * Alunos para a área de documentos: os do âmbito (aluno/encarregado), em blocos,
 * ou todos os da escola, em páginas de 1000 por número de processo.
 */
async function loadDocumentStudents(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  onlyStudents: string[] | null,
): Promise<{ data: DocumentStudentRow[]; error: { message: string } | null }> {
  const rows: DocumentStudentRow[] = [];
  if (onlyStudents) {
    for (const chunk of idChunks(onlyStudents)) {
      const { data, error } = await db
        .from("students")
        .select("id, student_number, person_id")
        .eq("school_id", schoolId)
        .in("id", chunk);
      if (error) return { data: [], error };
      rows.push(...((data ?? []) as DocumentStudentRow[]));
    }
  } else {
    const pageSize = 1000;
    for (let page = 0; page < 50; page += 1) {
      const { data, error } = await db
        .from("students")
        .select("id, student_number, person_id")
        .eq("school_id", schoolId)
        .order("student_number")
        .order("id")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) return { data: [], error };
      rows.push(...((data ?? []) as DocumentStudentRow[]));
      if (!data || data.length < pageSize) break;
    }
  }
  rows.sort((a, b) => String(a.student_number).localeCompare(String(b.student_number)));
  return { data: rows, error: null };
}

export const listDocumentWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listDocumentsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    // Alunos e encarregados só vêem os pedidos e o nome dos seus.
    const scope = await loadStudentScope(db, membership, context.userId);
    const onlyStudents = scope.all ? null : scope.studentIds;

    const [templatesResult, requestsResult, studentsResult] = await Promise.all([
      db
        .from("document_templates")
        .select("id, code, name, document_type, version, status, created_at")
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .order("name"),
      (onlyStudents
        ? db
            .from("document_requests")
            .select(
              "id, student_id, template_id, request_type, status, purpose, requested_by, reviewed_by, created_at, updated_at",
            )
            .eq("school_id", membership.schoolId)
            .in("student_id", onlyStudents)
        : db
            .from("document_requests")
            .select(
              "id, student_id, template_id, request_type, status, purpose, requested_by, reviewed_by, created_at, updated_at",
            )
            .eq("school_id", membership.schoolId)
      )
        .order("created_at", { ascending: false })
        .limit(data.limit),
      // Todos os alunos (para a escolha no pedido), em páginas; antes eram os 250
      // primeiros por número, e os pedidos dos outros saíam como «Aluno · Sem
      // processo» — também na declaração emitida.
      loadDocumentStudents(db, membership.schoolId, onlyStudents),
    ]);

    if (templatesResult.error) {
      throw publicDatabaseError(templatesResult.error, "Não foi possível carregar os modelos.");
    }
    if (requestsResult.error) {
      throw publicDatabaseError(requestsResult.error, "Não foi possível carregar os pedidos.");
    }
    if (studentsResult.error) {
      throw publicDatabaseError(studentsResult.error, "Não foi possível carregar os alunos.");
    }

    const personIds = [
      ...new Set((studentsResult.data ?? []).map((row: { person_id: string }) => row.person_id)),
    ];
    const peopleById = new Map<string, string>();
    for (const chunk of idChunks(personIds)) {
      for (const [id, name] of await loadPersonNamesById(db, membership.schoolId, chunk)) {
        peopleById.set(id, name);
      }
    }

    const students = (studentsResult.data ?? []).map(
      (student: { id: string; student_number: string; person_id: string }) => ({
        id: student.id,
        full_name: peopleById.get(student.person_id) ?? "Aluno",
        registration_number: student.student_number,
      }),
    );
    const studentIds = students.map((student) => student.id);
    const enrollments: Array<{ student_id: string; class_group_id: string | null }> = [];
    for (const chunk of idChunks(studentIds)) {
      const { data: rows } = await db
        .from("enrollments")
        .select("student_id, class_group_id")
        .eq("school_id", membership.schoolId)
        .in("student_id", chunk)
        .eq("status", "active");
      enrollments.push(...((rows ?? []) as typeof enrollments));
    }
    const classIds = [
      ...new Set(
        (enrollments ?? [])
          .map((row) => row.class_group_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const classGroups: Array<{ id: string; name: string }> = [];
    for (const chunk of idChunks(classIds)) {
      const { data: rows } = await db.from("class_groups").select("id, name").in("id", chunk);
      classGroups.push(...((rows ?? []) as typeof classGroups));
    }
    const classNameById = new Map((classGroups ?? []).map((row) => [row.id, row.name]));
    const classNameByStudentId = new Map(
      (enrollments ?? []).map((row) => [
        row.student_id,
        row.class_group_id ? (classNameById.get(row.class_group_id) ?? null) : null,
      ]),
    );
    const studentById = new Map(students.map((student) => [student.id, student]));
    const templateById = new Map(
      (templatesResult.data ?? []).map((template: { id: string; name: string }) => [
        template.id,
        template,
      ]),
    );

    return {
      templates: (templatesResult.data ?? []).map(
        (
          template: Record<string, unknown> & {
            id: string;
            name: string;
            status: string;
          },
        ) => ({
          ...template,
          active: template.status === "active",
          fee_amount: 0,
        }),
      ),
      students,
      requests: (requestsResult.data ?? []).map(
        (request: {
          id: string;
          student_id: string;
          template_id: string | null;
          request_type: string | null;
          status: string;
          purpose: string | null;
          requested_by: string | null;
          created_at: string;
        }) => {
          const student = studentById.get(request.student_id);
          const template = request.template_id ? templateById.get(request.template_id) : null;
          return {
            id: request.id,
            student_id: request.student_id,
            template_id: request.template_id,
            template_name:
              (template as { name?: string } | undefined)?.name ||
              request.request_type ||
              "Documento",
            student_name: student?.full_name ?? "Aluno",
            registration_number: student?.registration_number ?? "Sem processo",
            class_name: classNameByStudentId.get(request.student_id) ?? null,
            request_number: request.purpose || request.id.slice(0, 8),
            status: statusToUi[request.status] ?? "queued",
            // Em vocabulário da interface, como o resto do que sai daqui.
            next_status: (() => {
              const proximo = nextSgaStatus[request.status];
              return proximo ? (statusToUi[proximo] ?? null) : null;
            })(),
            requested_at: request.created_at,
            assigned_to: request.requested_by,
            priority: "normal",
            notes: request.purpose,
          };
        },
      ),
    };
  });

export const createDocumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createDocumentRequestInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: template, error: templateError } = await db
      .from("document_templates")
      .select("id, name, document_type")
      .eq("id", data.templateId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (templateError) {
      throw publicDatabaseError(templateError, "Não foi possível validar o modelo.");
    }
    if (!template) throw new Error("Modelo de documento não encontrado.");
    // O aluno tem de ser desta escola: a escrita usa o cliente privilegiado.
    const { data: ownStudent, error: studentError } = await db
      .from("students")
      .select("id")
      .eq("id", data.studentId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (studentError) {
      throw publicDatabaseError(studentError, "Não foi possível validar o aluno.");
    }
    if (!ownStudent) throw new Error("Aluno não encontrado nesta escola.");

    const purposeParts = [
      data.requestNumber ? `Nº ${data.requestNumber}` : null,
      data.priority === "urgent" ? "Urgente" : null,
      data.dueOn ? `Prazo ${data.dueOn}` : null,
      data.notes || null,
    ].filter(Boolean);

    const { data: request, error } = await db
      .from("document_requests")
      .insert({
        school_id: membership.schoolId,
        student_id: data.studentId,
        template_id: data.templateId,
        request_type: template.document_type || template.name,
        status: "submitted",
        // `purpose` é NOT NULL: sem nº, prazo nem notas a base recusava o pedido.
        purpose: purposeParts.join(" · ") || `Pedido de ${template.name}`,
        requested_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível registrar o pedido.");
    return request;
  });

export const updateDocumentRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateDocumentRequestStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: existing, error: existingError } = await db
      .from("document_requests")
      .select("id, status")
      .eq("id", data.requestId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (existingError) {
      throw publicDatabaseError(existingError, "Não foi possível validar o pedido.");
    }
    if (!existing) throw new Error("Pedido de documento não encontrado.");

    // O chamador fala o vocabulário da interface; a base só entende o seu.
    const estadoSga = uiStatusToSga[data.status];
    if (!estadoSga) {
      throw new Error(`Estado de pedido desconhecido: ${data.status}.`);
    }

    const agora = new Date().toISOString();
    const { data: updated, error } = await db
      .from("document_requests")
      .update({
        status: estadoSga,
        reviewed_by: context.userId,
        // `reviewed_at` existe na tabela e nunca era escrito: ficava-se a saber quem
        // reviu, mas não quando.
        reviewed_at: agora,
        updated_at: agora,
      })
      .eq("id", data.requestId)
      .eq("school_id", membership.schoolId)
      .select("id, status")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o estado do pedido.");
    return updated;
  });

const PRINT_SETTINGS_DOMAIN = "print_templates";
const MAX_TEMPLATE_CHARS = 80_000;

type JsonMap = Record<string, unknown>;
type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

async function readSettingDomain(db: AdminDb, schoolId: string, domain: string) {
  const { data, error } = await db
    .from("school_settings")
    .select("id, domain, version, value")
    .eq("school_id", schoolId)
    .eq("domain", domain)
    .maybeSingle();
  if (error && !/schema cache|does not exist|42P01|PGRST/i.test(error.message)) {
    throw publicDatabaseError(error, `Não foi possível ler settings:${domain}.`);
  }
  return data as { id: string; domain: string; version: number; value: JsonMap } | null;
}

function assertPrintKey(key: string): PrintTemplateKey {
  if (!isPrintTemplateKey(key)) throw new Error("Modelo de impressão não reconhecido.");
  return key;
}

// Os .hbs são importados como texto em bundle (?raw) em vez de lidos do
// disco em runtime: o Cloudflare Workers não tem sistema de ficheiros, e
// process.cwd()/readFile só funcionavam em `vite dev` local.
const BUNDLED_TEMPLATES: Record<PrintTemplateKey, string> = {
  "talao-candidatura": talaoCandidaturaHbs,
  "talao-matricula": talaoMatriculaHbs,
  "folha-credenciais": folhaCredenciaisHbs,
  "dossie-academico": dossieAcademicoHbs,
  "service-document": serviceDocumentHbs,
  "historico-academico-individual": historicoAcademicoIndividualHbs,
  "pauta-disciplinar": pautaDisciplinarHbs,
  "pauta-geral-turma": pautaGeralTurmaHbs,
  "boletim-escolar": boletimEscolarHbs,
  "certificado-habilitacoes": certificadoHabilitacoesHbs,
  "diario-pedagogico-professor": diarioPedagogicoProfessorHbs,
  "acta-conselho-notas": actaConselhoNotasHbs,
  "declaracao-notas-simples": declaracaoNotasSimplesHbs,
  "relatorio-validacao-notas": relatorioValidacaoNotasHbs,
  "mapa-estatistico-aproveitamento": mapaEstatisticoAproveitamentoHbs,
};

async function readBundledTemplate(key: PrintTemplateKey) {
  const source = BUNDLED_TEMPLATES[key];
  if (source.length > MAX_TEMPLATE_CHARS) {
    throw new Error("O modelo original excede o tamanho permitido.");
  }
  return { source, css: baseCss };
}

export const listPrintTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    const row = await readSettingDomain(db, membership.schoolId, PRINT_SETTINGS_DOMAIN);
    const settings = parsePrintSettings(row?.value);
    return {
      issue: settings.issue && isPrintTemplateKey(settings.issue) ? settings.issue : null,
      byType: settings.byType ?? {},
      items: PRINT_TEMPLATE_KEYS.map((key) => {
        const meta = PRINT_TEMPLATE_META[key];
        return {
          key,
          title: meta.title,
          type: meta.type,
          description: meta.description,
          sourceOfTruth: meta.sourceOfTruth,
          customized: Boolean(settings.overrides?.[key]),
          active: settings.issue === key || settings.byType?.[meta.type] === key,
        };
      }),
    };
  });

export const getPrintTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getPrintTemplateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const key = assertPrintKey(data.key);
    const db = await loadSgaAdminClient();
    const [bundled, row] = await Promise.all([
      readBundledTemplate(key),
      readSettingDomain(db, membership.schoolId, PRINT_SETTINGS_DOMAIN),
    ]);
    const settings = parsePrintSettings(row?.value);
    const override = settings.overrides?.[key];
    const meta = PRINT_TEMPLATE_META[key];
    return {
      key,
      title: meta.title,
      type: meta.type,
      description: meta.description,
      sourceOfTruth: meta.sourceOfTruth,
      source: override || bundled.source,
      original: bundled.source,
      css: bundled.css,
      customized: Boolean(override),
      active: settings.issue === key || settings.byType?.[meta.type] === key,
    };
  });

export const savePrintTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => savePrintTemplateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const key = assertPrintKey(data.key);
    const db = await loadSgaAdminClient();
    await updateSettingsDomainValue(
      db,
      membership.schoolId,
      PRINT_SETTINGS_DOMAIN,
      (current) => {
        const settings = parsePrintSettings(current);
        return { ...settings, overrides: { ...(settings.overrides ?? {}), [key]: data.source } };
      },
      context.userId,
    );
    return { key, customized: true };
  });

export const resetPrintTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resetPrintTemplateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const key = assertPrintKey(data.key);
    const db = await loadSgaAdminClient();
    await updateSettingsDomainValue(
      db,
      membership.schoolId,
      PRINT_SETTINGS_DOMAIN,
      (current) => {
        const settings = parsePrintSettings(current);
        const overrides = { ...(settings.overrides ?? {}) };
        delete overrides[key];
        return { ...settings, overrides };
      },
      context.userId,
    );
    return { key, customized: false };
  });

export const setActivePrintTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setActivePrintTemplateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const key = assertPrintKey(data.key);
    const db = await loadSgaAdminClient();
    const meta = PRINT_TEMPLATE_META[key];
    await updateSettingsDomainValue(
      db,
      membership.schoolId,
      PRINT_SETTINGS_DOMAIN,
      (current) => {
        const settings = parsePrintSettings(current);
        return {
          ...settings,
          issue: key,
          byType: { ...(settings.byType ?? {}), [meta.type]: key },
        };
      },
      context.userId,
    );
    return { key, issue: key };
  });

import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  FileDown,
  FilePlus2,
  GraduationCap,
  Mail,
  Receipt,
  MapPin,
  Wallet,
  Pencil,
  Phone,
  QrCode,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
} from "lucide-react";

const paymentStatusLabels: Record<string, string> = {
  paid: "Regular",
  pending: "Pendente",
  overdue: "Atrasado",
  partial: "Parcial",
};
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { StudentDigitalCardModal } from "@/features/students/components/StudentDigitalCardModal";
import { MediaAvatar } from "@/components/ui/media-frame";
import { IconChip } from "@/components/ui/icon-chip";
import { inferIcon } from "@/lib/auto-icon";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { applyLibraryPhotoToPerson } from "@/features/arquivos/apply-person-photo";
import { StudentRelatedFilesPanel } from "@/features/arquivos/StudentRelatedFilesPanel";
import { paymentReference, whatsappHref } from "@/features/integrations/actions";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import {
  assignGuardian,
  cancelEnrollment,
  changeStudentStatus,
  enrollStudentInClass,
  getStudentProfile,
  removeGuardian,
  updateEnrollment,
  updateEnrollmentAttendance,
  updateStudentProfile,
} from "@/features/students/server";
import { searchPeople } from "@/features/people/server";
import { personRelationshipTypeOptions } from "@/features/people/schemas";
import { buildStudentDossier, documentValidationCode } from "@/features/academic/assessment-views";
import {
  listPedagogicalWorkspace,
  getStudentAcademicHistory,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import { createDocumentRequest, listDocumentWorkspace } from "@/features/documents/server";
import {
  overlayBoletim,
  overlayCredenciais,
  overlayDossie,
  overlayHistorico,
  overlayServico,
} from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { officialDeclarationBody } from "@/features/documents/schemas";
import { issueInvoice, listInvoices, recordInvoicePayment } from "@/features/finance/server";
import { officialReceiptBody, paymentStatusFromInvoices } from "@/features/finance/schemas";
import { kwanza } from "@/lib/currency";
import { buildFinancePrintSchool } from "@/lib/finance-print";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { mapStudentProfileToSnapshot } from "@/features/intelligence/students/student-relations-adapter";
import { formatScore, angolaGradeScale } from "@/lib/angola-academic";
import { exportOfficialDeclarationPdf, exportOfficialPautaPdf } from "@/lib/export-pdf-loader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alunos/$studentId")({
  head: () => ({
    meta: [
      { title: "Ficha do Aluno · SIGA" },
      {
        name: "description",
        content:
          "Ficha completa do aluno: dados pessoais, encarregado de educação, matrícula, presença, média final e situação financeira.",
      },
      { property: "og:title", content: "Ficha do Aluno · SIGA" },
      {
        property: "og:description",
        content: "Dados pessoais, matrícula, desempenho académico e situação financeira do aluno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentDetail,
});

const badge = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

const estadoLabels: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
  transferred: "Transferido",
  graduated: "Concluído",
};

const pagamentoLabels: Record<string, string> = {
  settled: "Regularizado",
  pending: "Pendente",
  overdue: "Em dívida",
};

const relationshipLabels: Record<string, string> = {
  pai: "Pai",
  father: "Pai",
  mae: "Mãe",
  mother: "Mãe",
  encarregado: "Encarregado",
  guardian: "Encarregado",
  tutor: "Tutor",
  conjuge: "Cônjuge",
  irmao: "Irmão",
  sibling: "Irmão",
  grandparent: "Avô/Avó",
  other: "Outro",
  contacto_emergencia: "Contacto de emergência",
  responsavel_financeiro: "Responsável financeiro",
  responsavel_autorizado_buscar: "Autorizado a buscar",
};

type StudentProfile = {
  id: string;
  registration_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  student_status: string;
  payment_status: string | null;
  grade_name: string | null;
  class_name: string | null;
  course_name?: string | null;
  academic_year: string | null;
  person_id: string;
  school_id: string;
  person_version: number;
  enrollment_id: string | null;
  enrollment_status: string | null;
  enrolled_on: string | null;
  academic_year_id: string | null;
  final_average: number | null;
  attendance_rate: number | null;
  gender: string | null;
  birth_date: string | null;
  photo_url: string | null;
};

type StudentGuardian = {
  guardian_person_id: string;
  relationship: string;
  is_primary: boolean;
  guardian: { full_name: string; phone_primary: string | null; email: string | null } | null;
};

type StudentDocumentWorkspace = {
  templates: Array<{ id: string; name: string }>;
  requests: Array<{ student_id: string; template_name: string; status: string }>;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function NotFoundOrError({ title }: { title: string }) {
  return (
    <AppShell>
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-soft">
        <h1 className="font-display text-xl font-bold">{title}</h1>
        <Button asChild className="mt-6">
          <Link to="/alunos">Voltar à lista</Link>
        </Button>
      </div>
    </AppShell>
  );
}

function StudentDetail() {
  const { studentId } = Route.useParams();
  const queryClient = useQueryClient();
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const { activeYearLabel, selectedYearId, school, selectedYearLabel } = useSchoolSettings();
  const account = useCurrentAccount();
  const canIssueInvoice =
    account.role === "Administrador" ||
    account.role === "Secretaria" ||
    account.role === "Tesouraria";
  const canReceivePayment = account.role === "Administrador" || account.role === "Tesouraria";
  const canRequestDocument = account.role === "Administrador" || account.role === "Secretaria";
  const installed = useInstalledIntegrations();
  const agtOn = installed.hasCapability("agt.einvoice") || installed.hasCapability("agt.nif");
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendInvoices = installed.hasCapability("resend.invoices");
  const resendDocuments = installed.hasCapability("resend.documents");
  const resendOn = installed.hasCapability("resend.send") || resendInvoices || resendDocuments;
  const receiveMethods = [
    "Numerário",
    "Transferência",
    ...(installed.isInstalled("multicaixa_express") ? ["Multicaixa Express"] : []),
    ...(installed.isInstalled("unitel_money") ? ["Unitel Money"] : []),
  ];
  const profileQuery = useQuery({
    queryKey: ["students", "profile", studentId],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- createServerFn não infere o tipo de retorno desta função (ver getStudentProfile)
    queryFn: () => getStudentProfile({ data: { id: studentId } }) as Promise<any>,
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
  });
  const historyQuery = useQuery({
    queryKey: ["academic", "history", studentId],
    queryFn: () => getStudentAcademicHistory({ data: { studentId } }),
  });
  const peopleQuery = useQuery({
    queryKey: ["people", "search", ""],
    queryFn: () => searchPeople({ data: { query: "", limit: 50 } }),
  });
  const invoicesQuery = useQuery({
    queryKey: ["finance", "invoices", "student", studentId],
    queryFn: () => listInvoices({ data: { limit: 250 } }),
    retry: false,
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", "workspace"],
    queryFn: () =>
      listDocumentWorkspace({
        data: { limit: 100 },
      }) as unknown as Promise<StudentDocumentWorkspace>,
    enabled: canRequestDocument,
    retry: false,
  });

  const profileData = profileQuery.data as
    { student: StudentProfile | null; guardians: StudentGuardian[] } | undefined;
  const relationsSnapshot = useMemo(
    () =>
      profileData?.student
        ? mapStudentProfileToSnapshot(
            profileData.student,
            profileData.guardians,
            invoicesQuery.data,
            documentsQuery.data,
            historyQuery.data,
          )
        : null,
    [profileData, invoicesQuery.data, documentsQuery.data, historyQuery.data],
  );
  const focusedStudentEntity = useMemo(() => {
    if (!profileData?.student || !relationsSnapshot) return null;
    return {
      type: "student" as const,
      id: profileData.student.id,
      label: profileData.student.full_name,
      schoolId: profileData.student.school_id,
      data: relationsSnapshot,
    };
  }, [profileData, relationsSnapshot]);
  useDeclareEntityFocus(focusedStudentEntity);

  if (profileQuery.isLoading) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-soft">
          A carregar ficha do aluno…
        </div>
      </AppShell>
    );
  }

  if (profileQuery.isError) {
    return <NotFoundOrError title="Não foi possível carregar a ficha" />;
  }

  const { student, guardians } = profileData!;
  if (!student) return <NotFoundOrError title="Aluno não encontrado" />;

  const studentInvoices = (invoicesQuery.data ?? []).filter(
    (invoice) => invoice.student_id === studentId,
  );
  const paymentStatus = paymentStatusFromInvoices(studentInvoices) ?? student.payment_status;
  const templates = documentsQuery.data?.templates ?? [];
  const templateOptions = templates.map((template) => template.name);
  const suggestedInvoiceNumber = `FT-${new Date().getFullYear()}-${student.registration_number.replace(/\W/g, "").slice(-6)}`;
  const suggestedDocumentNumber = `DOC-${student.registration_number.replace(/\W/g, "").slice(-8)}`;
  const receiptYear =
    selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "";
  const downloadInvoiceReceipt = async (
    invoice: { number: string; total_amount: number; amount_paid: number },
    receiptNumber: string,
    amount: number,
  ) => {
    const validationCode = documentValidationCode([
      invoice.number,
      receiptNumber,
      student.registration_number,
    ]);
    await issuePrintDocument({
      tipo: "Recibo de pagamento",
      school: buildFinancePrintSchool(school, receiptYear),
      student: {
        fullName: student.full_name,
        academicNumber: student.registration_number,
        documentTitle: receiptNumber,
        validationCode,
      },
      overlay: overlayServico({
        name: "Recibo de pagamento",
        reference: receiptNumber,
        status: "Pago",
        parties: [
          { label: "Aluno", value: student.full_name },
          { label: "Processo", value: student.registration_number },
        ],
        sections: [
          {
            title: "Quitação",
            rows: [
              { label: "Fatura", value: invoice.number },
              { label: "Valor recebido", value: kwanza(amount) },
              { label: "Já liquidado", value: kwanza(invoice.amount_paid) },
            ],
          },
        ],
        term: officialReceiptBody({
          schoolName: school?.name ?? "Escola",
          studentName: student.full_name,
          invoiceNumber: invoice.number,
          receiptNumber,
          amountLabel: kwanza(amount),
        }),
        ...(school?.banking ? { banking: school.banking } : {}),
      }),
      fallback: () =>
        exportOfficialDeclarationPdf(`recibo-${receiptNumber}`, "Recibo de pagamento", {
          schoolName: school?.name ?? "Escola",
          academicYear: receiptYear,
          directorName: school?.director_name ?? undefined,
          issuedOn: new Date().toLocaleDateString("pt-AO"),
          validationCode,
          studentName: student.full_name,
          registrationNumber: student.registration_number,
          body: officialReceiptBody({
            schoolName: school?.name ?? "Escola",
            studentName: student.full_name,
            invoiceNumber: invoice.number,
            receiptNumber,
            amountLabel: kwanza(amount),
          }),
        }),
    });
  };

  const handleUpdateProfile = async (values: Record<string, string>) => {
    await updateStudentProfile({
      data: {
        personId: student.person_id,
        expectedVersion: student.person_version,
        fullName: values["nome"] ?? "",
        email: values["email"] || undefined,
        phone: values["telefone"] || undefined,
      },
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["students", "profile", studentId] }),
      queryClient.invalidateQueries({ queryKey: ["students", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["people", "search"] }),
    ]);
  };

  const handleChangeStatus = async (values: Record<string, string>) => {
    const statusMap: Record<string, "active" | "inactive" | "transferred" | "graduated"> = {
      Activo: "active",
      Inactivo: "inactive",
      Transferido: "transferred",
      Concluído: "graduated",
    };
    const newStatus = statusMap[values["estado"] ?? ""] ?? "active";
    await changeStudentStatus({
      data: {
        studentId,
        newStatus,
        reason: values["motivo"] || undefined,
      },
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["students", "profile", studentId] }),
      queryClient.invalidateQueries({ queryKey: ["students", "search"] }),
    ]);
  };

  const classGroups = workspaceQuery.data?.classGroups ?? [];
  const turmaOptions = classGroups.map(
    (group) =>
      `${group.name} · ${group.grade_name} · ${group.course_name} · ${group.id.slice(0, 8)}`,
  );

  const invalidateStudent = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["students", "profile", studentId] }),
      queryClient.invalidateQueries({ queryKey: ["students", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["students", "enrollments"] }),
    ]);
  };

  const handleAssignClass = async (values: Record<string, string>) => {
    const index = turmaOptions.indexOf(values["turma"] ?? "");
    const selected = index >= 0 ? classGroups[index] : undefined;
    if (!selected) throw new Error("Seleccione uma turma válida.");
    if (student.enrollment_id) {
      await updateEnrollment({
        data: {
          enrollmentId: student.enrollment_id,
          classGroupId: selected.id,
          status: "active",
        },
      });
    } else {
      const academicYearId =
        selected.academic_year_id ?? student.academic_year_id ?? selectedYearId;
      if (!academicYearId) throw new Error("A turma seleccionada não tem ano lectivo associado.");
      await enrollStudentInClass({
        data: {
          studentId,
          classGroupId: selected.id,
          academicYearId,
        },
      });
    }
    await invalidateStudent();
  };

  const studentPrintSchool = {
    name: school?.name ?? "Escola",
    nif: school?.nif,
    phone: school?.phone,
    email: school?.email,
    address: school?.address,
    directorName: school?.director_name,
    academicYear:
      student.academic_year ||
      selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") ||
      school?.academic_year ||
      "",
  };

  const studentDossierRows = () => {
    if (!student.enrollment_id) {
      throw new Error("O aluno precisa de matrícula activa para emitir este documento.");
    }
    const grades = (workspaceQuery.data?.termGrades ?? []).filter(
      (row) => row.enrollment_id === student.enrollment_id,
    );
    const subjectIds = new Set(grades.map((row) => row.subject_id));
    const subjects = (workspaceQuery.data?.subjects ?? []).filter((subject) =>
      subjectIds.has(subject.id),
    );
    if (subjects.length === 0) {
      throw new Error("Ainda não há notas lançadas para este aluno.");
    }
    return buildStudentDossier(
      grades,
      subjects,
      student.enrollment_id,
      school?.passing_grade ?? 10,
    ).map((row) => ({
      name: row.subjectName,
      t1: formatScore(row.terms[0]),
      t2: formatScore(row.terms[1]),
      t3: formatScore(row.terms[2]),
      mfa: formatScore(row.mfa),
      status: row.situacao.label,
    }));
  };

  /**
   * Histórico multi-ano: um período por ano lectivo (matrícula), a partir do mesmo motor de
   * cálculo (assessment-engine.ts) que alimenta a Pauta Final — nunca diverge dela.
   */
  const historicoPeriods = () => {
    const years = historyQuery.data?.years ?? [];
    if (years.length === 0) {
      throw new Error("Ainda não há histórico académico registado para este aluno.");
    }
    return years.map((year) => ({
      periodName: year.academicYearName,
      ...(year.overallMfd != null ? { average: formatScore(year.overallMfd) } : {}),
      status: year.status || "Pendente",
      subjects: year.subjects.map((subject) => ({
        name: subject.subjectName,
        t1: formatScore(subject.mt1),
        t2: formatScore(subject.mt2),
        t3: formatScore(subject.mt3),
        mfa: formatScore(subject.mfd),
        status:
          subject.mfd == null
            ? "Pendente"
            : subject.mfd >= angolaGradeScale.passing
              ? "Aprovado"
              : "Reprovado",
      })),
    }));
  };

  const downloadBoletim = async () => {
    const rows = studentDossierRows();
    const academicYear = studentPrintSchool.academicYear || "";
    await issuePrintDocument({
      tipo: "Boletim escolar",
      school: studentPrintSchool,
      student: {
        fullName: student.full_name,
        academicNumber: student.registration_number,
        className: student.class_name,
        programName: student.grade_name,
        validationCode: documentValidationCode([
          student.id,
          student.registration_number,
          academicYear,
        ]),
      },
      overlay: overlayBoletim({
        subjects: rows,
        ...(rows[0]?.mfa ? { average: rows[0].mfa } : {}),
        attendance:
          student.attendance_rate != null ? `${Math.round(Number(student.attendance_rate))}%` : "—",
        status: rows.every((row) => !/reprov|não trans/i.test(row.status))
          ? "Transita"
          : "Pendente",
        approved: rows.filter((row) => !/reprov|não trans|pendente/i.test(row.status)).length,
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          `boletim-${student.registration_number}`,
          "Boletim de avaliação",
          {
            schoolName: school?.name ?? "Escola",
            academicYear,
            gradeName: student.grade_name ?? undefined,
            className: student.class_name ?? undefined,
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              student.id,
              student.registration_number,
              academicYear,
            ]),
          },
          [
            { label: "Disciplina", value: (row) => row.disciplina },
            { label: "1º T", value: (row) => row.t1 },
            { label: "2º T", value: (row) => row.t2 },
            { label: "3º T", value: (row) => row.t3 },
            { label: "MFA", value: (row) => row.mfa },
            { label: "Situação", value: (row) => row.situacao },
          ],
          rows.map((row) => ({
            disciplina: row.name,
            t1: row.t1,
            t2: row.t2,
            t3: row.t3,
            mfa: row.mfa,
            situacao: row.status,
          })),
        ),
    });
  };

  const downloadHistorico = async () => {
    const periods = historicoPeriods();
    const academicYear = studentPrintSchool.academicYear || "";
    await issuePrintDocument({
      tipo: "Histórico académico",
      school: studentPrintSchool,
      student: {
        fullName: student.full_name,
        academicNumber: student.registration_number,
        className: student.class_name,
        programName: student.grade_name,
        validationCode: documentValidationCode([
          student.id,
          student.registration_number,
          "historico",
          academicYear,
        ]),
      },
      overlay: overlayHistorico({ periods }),
    });
  };

  const studentRequests = (documentsQuery.data?.requests ?? []).filter(
    (request) => request.student_id === studentId,
  );

  const downloadDossie = async () => {
    let subjects: Array<{ name: string; status: string }> = [];
    try {
      subjects = studentDossierRows().map((row) => ({ name: row.name, status: row.status }));
    } catch {
      subjects = (workspaceQuery.data?.subjects ?? []).map((subject) => ({
        name: subject.name,
        status: "Sem notas",
      }));
    }
    await issuePrintDocument({
      tipo: "Dossiê académico",
      school: studentPrintSchool,
      student: {
        fullName: student.full_name,
        academicNumber: student.registration_number,
        className: student.class_name,
        programName: student.grade_name ?? student.course_name,
      },
      overlay: overlayDossie({
        status: estadoLabels[student.student_status] ?? student.student_status,
        enrollmentStatus: student.enrollment_id ? "Activa" : "Sem matrícula",
        checklist: [
          { item: "Matrícula activa", ok: Boolean(student.enrollment_id) },
          { item: "Turma atribuída", ok: Boolean(student.class_name) },
          { item: "Encarregado de educação", ok: guardians.length > 0 },
          { item: "Contacto do aluno", ok: Boolean(student.email || student.phone) },
          { item: "Situação financeira regular", ok: paymentStatus === "settled" },
        ],
        subjects,
        documents: studentRequests.map((request) => ({
          name: request.template_name,
          type: request.status,
        })),
      }),
    });
  };

  const downloadCredenciais = async () => {
    const domain = school?.email?.split("@")[1] || "escola.ao";
    await issuePrintDocument({
      tipo: "Folha de credenciais",
      school: studentPrintSchool,
      student: {
        fullName: student.full_name,
        academicNumber: student.registration_number,
        className: student.class_name,
        programName: student.grade_name ?? student.course_name,
      },
      overlay: overlayCredenciais({
        fullName: student.full_name,
        process: student.registration_number,
        email: student.email,
        schoolEmailDomain: domain,
      }),
    });
  };

  const downloadCertificado = async () => {
    // Certificado deriva do Histórico, mas certifica apenas o ano lectivo mais recente concluído
    // (o Histórico completo mostra a trajectória multi-ano; ver historicoPeriods()).
    const periods = historicoPeriods().slice(-1);
    const academicYear = studentPrintSchool.academicYear || "";
    await issuePrintDocument({
      tipo: "Certificado de habilitações",
      school: studentPrintSchool,
      student: {
        fullName: student.full_name,
        academicNumber: student.registration_number,
        className: student.class_name,
        programName: student.grade_name ?? student.course_name,
        validationCode: documentValidationCode([
          student.id,
          student.registration_number,
          "certificado",
          academicYear,
        ]),
      },
      overlay: overlayHistorico({ periods }),
    });
  };

  const downloadDeclaracao = async () => {
    const academicYear = studentPrintSchool.academicYear || "";
    await issuePrintDocument({
      tipo: "Declaração de notas",
      school: studentPrintSchool,
      student: {
        fullName: student.full_name,
        academicNumber: student.registration_number,
        className: student.class_name,
        programName: student.grade_name,
        validationCode: documentValidationCode([
          student.id,
          student.registration_number,
          academicYear,
        ]),
      },
      fallback: () =>
        exportOfficialDeclarationPdf(`declaracao-${student.registration_number}`, "Declaração", {
          schoolName: school?.name ?? "Escola",
          academicYear,
          className: student.class_name ?? undefined,
          directorName: school?.director_name ?? undefined,
          issuedOn: new Date().toLocaleDateString("pt-AO"),
          validationCode: documentValidationCode([
            student.id,
            student.registration_number,
            academicYear,
          ]),
          studentName: student.full_name,
          registrationNumber: student.registration_number,
          body: officialDeclarationBody({
            schoolName: school?.name ?? "Escola",
            studentName: student.full_name,
            registrationNumber: student.registration_number,
            className: student.class_name,
            academicYear,
          }),
        }),
    });
  };

  const linkedGuardianIds = new Set(guardians.map((row) => row.guardian_person_id));
  const personOptionFor = (row: { full_name: string; id: string }) =>
    `${row.full_name} · ${row.id.slice(0, 8)}`;
  const guardianOptions = (peopleQuery.data ?? [])
    .filter((row) => row.id !== student.person_id && !linkedGuardianIds.has(row.id))
    .filter((row) => row.status !== "inactive")
    .map(personOptionFor);

  const handleAssignGuardian = async (values: Record<string, string>) => {
    const selected = (peopleQuery.data ?? []).find(
      (row) => personOptionFor(row) === values["pessoa"],
    );
    const relationship = personRelationshipTypeOptions.find(
      (option) => relationshipLabels[option] === values["parentesco"],
    );
    if (!selected || !relationship) throw new Error("Seleccione a pessoa e o parentesco.");
    await assignGuardian({
      data: {
        studentId,
        guardianPersonId: selected.id,
        relationship,
        isPrimary: values["principal"] === "Sim",
      },
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["students", "profile", studentId] }),
      queryClient.invalidateQueries({ queryKey: ["students", "search"] }),
    ]);
  };

  const initials = student.full_name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  return (
    <AppShell>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2">
          <Link to="/alunos">
            <ArrowLeft className="size-4" /> Gestão de Alunos
          </Link>
        </Button>

        <InstalledModuleTools module="alunos" />
        <InstalledModuleTools module="faturas" />
        <InstalledModuleTools module="documentos" />

        <div className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-card p-6 shadow-soft">
          <div className="flex flex-col items-center gap-2">
            <MediaAvatar
              src={student.photo_url}
              alt={student.full_name}
              fallback={initials}
              className="size-16 rounded-2xl text-xl"
            />
            <PickFileButton
              label="Foto"
              area="secretaria"
              acceptKinds={["png", "jpeg"]}
              variant="outline"
              size="sm"
              onPick={(file) => {
                void (async () => {
                  try {
                    await applyLibraryPhotoToPerson({
                      personId: student.person_id,
                      schoolId: String(student.school_id),
                      file,
                    });
                    await Promise.all([
                      queryClient.invalidateQueries({
                        queryKey: ["students", "profile", student.id],
                      }),
                      queryClient.invalidateQueries({
                        queryKey: ["people", "get", student.person_id],
                      }),
                      queryClient.invalidateQueries({
                        queryKey: ["arquivos", "student-related", student.person_id],
                      }),
                    ]);
                    toast.success("Foto actualizada a partir da biblioteca");
                  } catch (error) {
                    toast.error("Não foi possível actualizar a foto", {
                      description: error instanceof Error ? error.message : "Tente novamente.",
                    });
                  }
                })();
              }}
            />
          </div>

          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              {student.full_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {student.registration_number}
              {student.grade_name ? ` · ${student.grade_name} Classe` : ""}
              {student.class_name ? ` · Turma ${student.class_name}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cn(badge, "bg-success/15 text-success")}>
                {estadoLabels[student.student_status] ?? student.student_status}
              </span>
              {student.course_name ? (
                <span className={cn(badge, "bg-primary-soft text-primary-strong")}>
                  {student.course_name}
                </span>
              ) : null}
              {paymentStatus ? (
                <span
                  className={cn(
                    badge,
                    paymentStatus === "settled"
                      ? "bg-success/15 text-success"
                      : paymentStatus === "overdue"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/20 text-warning-foreground",
                  )}
                >
                  {paymentStatusLabels[paymentStatus] ?? paymentStatus}
                </span>
              ) : null}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2 text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 shadow-2xs"
              onClick={() => setCardModalOpen(true)}
            >
              <QrCode className="size-4 text-primary" /> Cartão Digital PWA
            </Button>
            {turmaOptions.length > 0 ? (
              <QuickFormModal
                eyebrow={student.registration_number}
                title="Atribuir turma"
                description="Associa o aluno a uma turma do catálogo académico e sincroniza o ano lectivo da turma."
                icon={<GraduationCap className="size-5" />}
                submitLabel="Confirmar turma"
                onSubmit={handleAssignClass}
                fields={[
                  {
                    name: "turma",
                    label: "Turma",
                    type: "select",
                    options: turmaOptions,
                    full: true,
                    defaultValue: student.class_name
                      ? turmaOptions.find((option) => option.startsWith(`${student.class_name} ·`))
                      : undefined,
                  },
                ]}
                trigger={(open) => (
                  <Button variant="outline" className="gap-2" onClick={open}>
                    <GraduationCap className="size-4" />
                    {student.enrollment_id ? "Alterar turma" : "Atribuir turma"}
                  </Button>
                )}
              />
            ) : (
              <Button asChild variant="outline" className="gap-2">
                <Link to="/pedagogica">
                  <GraduationCap className="size-4" /> Criar turmas em Pedagógica
                </Link>
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => setCardModalOpen(true)}>
              <Smartphone className="size-4" /> Cartão Digital
            </Button>
            {student.enrollment_id ? (
              <>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    void downloadBoletim().catch((error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível emitir o boletim.",
                      ),
                    );
                  }}
                >
                  <FileDown className="size-4" /> Boletim
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    void downloadHistorico().catch((error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível emitir o histórico.",
                      ),
                    );
                  }}
                >
                  <FileDown className="size-4" /> Histórico
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    void downloadDeclaracao().catch((error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível emitir a declaração.",
                      ),
                    );
                  }}
                >
                  <FileDown className="size-4" /> Declaração
                </Button>
                {resendDocuments ? (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `Documentos de ${student.full_name} (${student.registration_number}) emitidos no SIGA.`,
                      );
                      toast.success("Texto dos documentos copiado para e-mail Resend");
                    }}
                  >
                    E-mail
                  </Button>
                ) : null}
                {whatsappOn ? (
                  <Button variant="outline" className="gap-2" asChild>
                    <a
                      href={whatsappHref(
                        guardians[0]?.guardian?.phone_primary ?? student.phone ?? "",
                        `Documentos de ${student.full_name} (${student.registration_number}) estão prontos para levantamento.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  </Button>
                ) : null}
                <QuickFormModal
                  eyebrow={student.registration_number}
                  title="Outros modelos oficiais"
                  description="Dossiê, certificado e credenciais do portal com o modelo activo da escola."
                  icon={<FileDown className="size-5" />}
                  submitLabel="Imprimir"
                  successDescription="Modelo aberto para impressão."
                  fields={[
                    {
                      name: "modelo",
                      label: "Modelo",
                      type: "select",
                      options: [
                        "Dossiê académico",
                        "Certificado de habilitações",
                        "Folha de credenciais",
                      ],
                      full: true,
                    },
                  ]}
                  onSubmit={async (values) => {
                    if (values["modelo"] === "Certificado de habilitações") {
                      await downloadCertificado();
                      return;
                    }
                    if (values["modelo"] === "Folha de credenciais") {
                      await downloadCredenciais();
                      return;
                    }
                    await downloadDossie();
                  }}
                  trigger={(open) => (
                    <Button variant="outline" className="gap-2" onClick={open}>
                      <FileDown className="size-4" /> Mais modelos
                    </Button>
                  )}
                />
              </>
            ) : null}
            {canIssueInvoice && student.enrollment_id ? (
              <QuickFormModal
                eyebrow={student.registration_number}
                title="Emitir fatura"
                description="Cria a fatura neste aluno. Precisa de plano financeiro activo e matrícula na turma."
                icon={<Receipt className="size-5" />}
                submitLabel="Emitir"
                successDescription="Fatura emitida."
                onSubmit={async (values) => {
                  const nifNote = agtOn && school?.nif ? ` NIF ${school.nif} (AGT).` : "";
                  await issueInvoice({
                    data: {
                      studentId,
                      number: values["numero"],
                      dueOn: values["vencimento"],
                      category: values["categoria"],
                      amount: Number(values["valor"]),
                      description: `${values["descricao"] || ""}${nifNote}`.trim() || undefined,
                    },
                  });
                  await queryClient.invalidateQueries({ queryKey: ["finance", "invoices"] });
                }}
                fields={[
                  {
                    name: "numero",
                    label: "Número",
                    defaultValue: suggestedInvoiceNumber,
                  },
                  {
                    name: "categoria",
                    label: "Categoria",
                    type: "select",
                    options: ["Mensalidade", "Matrícula", "Documento", "Outro"],
                  },
                  { name: "valor", label: "Valor (Kz)", type: "number", placeholder: "45000" },
                  { name: "vencimento", label: "Vencimento", type: "date" },
                  {
                    name: "descricao",
                    label: "Descrição",
                    type: "textarea",
                    full: true,
                    required: false,
                  },
                ]}
                trigger={(open) => (
                  <Button variant="outline" className="gap-2" onClick={open}>
                    <Receipt className="size-4" /> Fatura
                  </Button>
                )}
              />
            ) : null}
            {canRequestDocument && templateOptions.length > 0 ? (
              <QuickFormModal
                eyebrow={student.registration_number}
                title="Pedir documento"
                description="Regista o pedido na secretaria para este aluno."
                icon={<FilePlus2 className="size-5" />}
                submitLabel="Registar pedido"
                successDescription="Pedido de documento registado."
                onSubmit={async (values) => {
                  const template = templates[templateOptions.indexOf(values["modelo"] ?? "")];
                  if (!template) throw new Error("Seleccione um modelo válido.");
                  await createDocumentRequest({
                    data: {
                      studentId,
                      templateId: template.id,
                      requestNumber: values["numero"],
                      priority: values["urgencia"] === "Urgente" ? "urgent" : "normal",
                      dueOn: values["prazo"] || undefined,
                      notes: values["notas"] || undefined,
                    },
                  });
                  await queryClient.invalidateQueries({ queryKey: ["documents", "workspace"] });
                }}
                fields={[
                  {
                    name: "modelo",
                    label: "Modelo",
                    type: "select",
                    options: templateOptions,
                    full: true,
                  },
                  {
                    name: "numero",
                    label: "Número do pedido",
                    defaultValue: suggestedDocumentNumber,
                  },
                  {
                    name: "prazo",
                    label: "Prazo de entrega",
                    type: "date",
                    required: false,
                  },
                  {
                    name: "urgencia",
                    label: "Urgência",
                    type: "select",
                    options: ["Normal", "Urgente"],
                  },
                  {
                    name: "notas",
                    label: "Notas internas",
                    type: "textarea",
                    full: true,
                    required: false,
                  },
                ]}
                trigger={(open) => (
                  <Button variant="outline" className="gap-2" onClick={open}>
                    <FilePlus2 className="size-4" /> Documento
                  </Button>
                )}
              />
            ) : null}
            {student.enrollment_id ? (
              <ConfirmActionModal
                title="Anular matrícula"
                description={`A matrícula activa de ${student.full_name} será anulada. O processo do aluno mantém-se.`}
                confirmLabel="Anular matrícula"
                onConfirm={async () => {
                  await cancelEnrollment({
                    data: { enrollmentId: student.enrollment_id!, reason: "Anulada na ficha" },
                  });
                  await invalidateStudent();
                }}
                trigger={(open) => (
                  <Button variant="outline" className="gap-2 text-destructive" onClick={open}>
                    <Trash2 className="size-4" /> Anular matrícula
                  </Button>
                )}
              />
            ) : null}
            <QuickFormModal
              eyebrow={student.registration_number}
              title="Alterar estado"
              description="Actualize o estado académico do aluno e registe o motivo."
              icon={<UserCheck className="size-5" />}
              submitLabel="Confirmar estado"
              onSubmit={handleChangeStatus}
              fields={[
                {
                  name: "estado",
                  label: "Novo estado",
                  type: "select",
                  options: ["Activo", "Inactivo", "Transferido", "Concluído"],
                  defaultValue: estadoLabels[student.student_status] ?? "Activo",
                },
                {
                  name: "motivo",
                  label: "Motivo",
                  type: "textarea",
                  full: true,
                  required: false,
                  placeholder: "Opcional",
                },
              ]}
              trigger={(open) => (
                <Button variant="outline" className="gap-2" onClick={open}>
                  <UserCheck className="size-4" /> Alterar estado
                </Button>
              )}
            />
            <QuickFormModal
              eyebrow={student.registration_number}
              title="Editar ficha"
              description="Actualize os dados pessoais e académicos deste estudante."
              icon={<Pencil className="size-5" />}
              size="lg"
              submitLabel="Guardar alterações"
              note="No SGA, people não tem coluna de morada — só nome, email e telefone são gravados."
              onSubmit={handleUpdateProfile}
              fields={[
                {
                  name: "nome",
                  label: "Nome completo",
                  defaultValue: student.full_name,
                  full: true,
                },
                { name: "email", label: "Email", defaultValue: student.email ?? "" },
                { name: "telefone", label: "Telefone", defaultValue: student.phone ?? "" },
              ]}
              trigger={(open) => (
                <Button className="gap-2" onClick={open}>
                  <Pencil className="size-4" /> Editar ficha
                </Button>
              )}
            />
          </div>
        </div>

        <StudentRelatedFilesPanel
          personId={student.person_id}
          schoolId={String(student.school_id)}
          studentId={student.id}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Média final",
              value: student.final_average != null ? student.final_average.toFixed(1) : "—",
              hint: "Escala 0-20",
              action: null as ReactNode,
            },
            {
              label: "Taxa de presença",
              value:
                student.attendance_rate != null
                  ? `${Math.round(Number(student.attendance_rate))}%`
                  : "—",
              hint: "Ano lectivo actual",
              action:
                canRequestDocument && student.enrollment_id ? (
                  <QuickFormModal
                    title="Taxa de presença"
                    description="Percentagem de presenças no ano lectivo actual (0 a 100)."
                    submitLabel="Guardar"
                    successDescription="Presença actualizada na matrícula."
                    fields={[
                      {
                        name: "presenca",
                        label: "Presença (%)",
                        type: "number",
                        required: true,
                        defaultValue: student.attendance_rate ?? "",
                        placeholder: "96",
                      },
                    ]}
                    trigger={(open) => (
                      <Button variant="outline" size="sm" className="mt-3" onClick={open}>
                        Registar
                      </Button>
                    )}
                    onSubmit={async (values) => {
                      await updateEnrollmentAttendance({
                        data: {
                          enrollmentId: student.enrollment_id as string,
                          attendanceRate: Number(values["presenca"]),
                        },
                      });
                      await queryClient.invalidateQueries({
                        queryKey: ["students", "profile", studentId],
                      });
                      await queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
                      await queryClient.invalidateQueries({
                        queryKey: ["academic", "pedagogical-workspace"],
                      });
                    }}
                  />
                ) : null,
            },
            {
              label: "Estado académico",
              value: student.enrollment_status
                ? (estadoLabels[student.enrollment_status] ?? student.enrollment_status)
                : "Sem matrícula activa",
              hint: student.enrolled_on
                ? new Date(student.enrolled_on).toLocaleDateString("pt-PT")
                : "Ainda sem turma atribuída",
              action: null,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border bg-card p-5 shadow-soft"
            >
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
              {item.action}
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2.5">
              <IconChip {...inferIcon("Dados pessoais")} size="sm" />
              <h2 className="font-display text-base font-bold">Dados pessoais</h2>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo" value={student.full_name} />
              <Field label="Género" value={student.gender ?? "—"} />
              <Field
                label="Data de nascimento"
                value={
                  student.birth_date
                    ? new Date(student.birth_date).toLocaleDateString("pt-PT")
                    : "—"
                }
              />
              <Field label="Nº de processo" value={student.registration_number} />
              <div>
                <Field label="Email" value={student.email ?? "—"} />
                {resendOn && student.email ? (
                  <button
                    type="button"
                    className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `SIGA · ${student.full_name} (${student.registration_number})\n${student.email}`,
                      );
                      toast.success("Contacto copiado para e-mail Resend");
                    }}
                  >
                    E-mail Resend
                  </button>
                ) : null}
              </div>
              <div>
                <Field label="Telefone" value={student.phone ?? "—"} />
                {whatsappOn && student.phone ? (
                  <a
                    href={whatsappHref(student.phone)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline"
                  >
                    WhatsApp
                  </a>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <IconChip {...inferIcon("Encarregados")} size="sm" />
                <h2 className="font-display text-base font-bold">Encarregados de educação</h2>
              </div>
              <QuickFormModal
                eyebrow={student.registration_number}
                title="Associar encarregado"
                description="Liga uma pessoa já existente no registo central a este aluno."
                icon={<UserPlus className="size-5" />}
                submitLabel="Associar"
                onSubmit={handleAssignGuardian}
                fields={[
                  {
                    name: "pessoa",
                    label: "Pessoa",
                    type: "select",
                    options: guardianOptions,
                    full: true,
                  },
                  {
                    name: "parentesco",
                    label: "Parentesco",
                    type: "select",
                    options: personRelationshipTypeOptions.flatMap((option) => {
                      const label = relationshipLabels[option];
                      return label ? [label] : [];
                    }),
                  },
                  {
                    name: "principal",
                    label: "Encarregado principal",
                    type: "select",
                    options: ["Não", "Sim"],
                    defaultValue: guardians.length === 0 ? "Sim" : "Não",
                  },
                ]}
                trigger={(open) => (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={open}
                    disabled={!guardianOptions.length}
                  >
                    <UserPlus className="size-3.5" /> Associar
                  </Button>
                )}
              />
            </div>
            <div className="mt-4 space-y-4 text-sm">
              {guardians.length > 0 ? (
                guardians.map((g) => (
                  <div
                    key={g.guardian_person_id}
                    className="border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {g.guardian?.full_name ?? "—"}
                          {g.is_primary ? (
                            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                              (principal)
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {relationshipLabels[g.relationship as keyof typeof relationshipLabels] ??
                            g.relationship}
                        </p>
                      </div>
                      <ConfirmActionModal
                        title="Remover encarregado"
                        description={`${g.guardian?.full_name ?? "Esta pessoa"} deixa de ficar ligada a este aluno.`}
                        confirmLabel="Remover"
                        onConfirm={async () => {
                          await removeGuardian({
                            data: {
                              studentId,
                              guardianPersonId: g.guardian_person_id,
                            },
                          });
                          await Promise.all([
                            queryClient.invalidateQueries({
                              queryKey: ["students", "profile", studentId],
                            }),
                            queryClient.invalidateQueries({ queryKey: ["students", "search"] }),
                          ]);
                        }}
                        trigger={(open) => (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            aria-label="Remover encarregado"
                            onClick={open}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      />
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-3.5" /> {g.guardian?.phone_primary ?? "—"}
                      {whatsappOn && g.guardian?.phone_primary ? (
                        <a
                          href={whatsappHref(
                            g.guardian.phone_primary,
                            `SIGA · ${student.full_name} (${student.registration_number})`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          WhatsApp
                        </a>
                      ) : null}
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                      <Mail className="size-3.5" /> {g.guardian?.email ?? "—"}
                      {resendOn && g.guardian?.email ? (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-primary hover:underline"
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              `SIGA · encarregado de ${student.full_name}\n${g.guardian?.email}`,
                            );
                            toast.success("E-mail copiado para Resend");
                          }}
                        >
                          E-mail Resend
                        </button>
                      ) : null}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">Sem encarregados associados.</p>
              )}
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-4" /> Morada não disponível no SGA
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <IconChip {...inferIcon("Matrícula e situação")} size="sm" />
              <h2 className="font-display text-base font-bold">Matrícula e situação</h2>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Curso" value={student.course_name ?? "—"} />
              <Field
                label="Classe"
                value={student.grade_name ? `${student.grade_name} Classe` : "—"}
              />
              <Field label="Turma" value={student.class_name ?? "—"} />
              <Field
                label="Situação financeira"
                value={paymentStatus ? (pagamentoLabels[paymentStatus] ?? paymentStatus) : "—"}
              />
            </div>
            {studentInvoices.length > 0 ? (
              <ul className="mt-4 space-y-2 text-sm">
                {studentInvoices.slice(0, 5).map((invoice) => {
                  const openAmount = Math.max(
                    Number(invoice.total_amount ?? 0) - Number(invoice.amount_paid ?? 0),
                    0,
                  );
                  return (
                    <li
                      key={invoice.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground"
                    >
                      <span>
                        {invoice.number} · {invoice.description}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {kwanza(Number(invoice.total_amount ?? 0))}
                          {invoice.status === "paid" ? " · Pago" : ""}
                        </span>
                        {invoice.status === "paid" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() =>
                              void downloadInvoiceReceipt(
                                invoice,
                                `RC-${invoice.number.replace(/^FT-?/i, "")}`,
                                Number(invoice.amount_paid ?? invoice.total_amount ?? 0),
                              )
                            }
                          >
                            Recibo
                          </Button>
                        ) : canReceivePayment ? (
                          <QuickFormModal
                            title={`Receber ${invoice.number}`}
                            description="Liquida esta fatura e emite o recibo. Canais instalados aparecem no método."
                            icon={<Wallet className="size-5" />}
                            submitLabel="Confirmar"
                            successDescription="Pagamento registado."
                            fields={[
                              {
                                name: "valor",
                                label: "Valor (Kz)",
                                type: "number",
                                defaultValue: String(openAmount || invoice.total_amount),
                              },
                              {
                                name: "recibo",
                                label: "Referência interna (opcional)",
                                defaultValue: `RC-${invoice.number.replace(/^FT-?/i, "")}`,
                                required: false,
                              },
                              {
                                name: "metodo",
                                label: "Método",
                                type: "select",
                                options: receiveMethods,
                              },
                              {
                                name: "referencia",
                                label: "Referência",
                                required: false,
                              },
                            ]}
                            onSubmit={async (values) => {
                              const amount = Number(values["valor"]);
                              const methodMap = {
                                Numerário: "cash",
                                Transferência: "transfer",
                                "Multicaixa Express": "multicaixa_express",
                                "Unitel Money": "unitel_money",
                              } as const;
                              const method =
                                methodMap[
                                  (values["metodo"] as keyof typeof methodMap) ?? "Numerário"
                                ] ?? "cash";
                              const reference =
                                values["referencia"] ||
                                (method === "multicaixa_express"
                                  ? paymentReference("EMIS")
                                  : method === "unitel_money"
                                    ? paymentReference("UML")
                                    : undefined);
                              const paid = await recordInvoicePayment({
                                data: {
                                  invoiceId: invoice.id,
                                  receiptNumber: values["recibo"],
                                  amount,
                                  method,
                                  reference,
                                },
                              });
                              await queryClient.invalidateQueries({
                                queryKey: ["finance", "invoices"],
                              });
                              // Número oficial vem do servidor (gerado atomicamente) — nunca do
                              // valor digitado, para o PDF impresso bater sempre com a base de dados.
                              await downloadInvoiceReceipt(invoice, paid.receipt_number, amount);
                            }}
                            trigger={(open) => (
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={open}>
                                Receber
                              </Button>
                            )}
                          />
                        ) : null}
                        {resendInvoices ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={async () => {
                              await navigator.clipboard.writeText(
                                `${invoice.number} · ${student.full_name} · ${kwanza(Number(invoice.total_amount ?? 0))}`,
                              );
                              toast.success("Texto da fatura copiado para e-mail Resend");
                            }}
                          >
                            E-mail
                          </Button>
                        ) : null}
                        {whatsappOn ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                            <a
                              href={whatsappHref(
                                guardians[0]?.guardian?.phone_primary ?? "",
                                `Fatura ${invoice.number} de ${student.full_name}: ${kwanza(Number(invoice.total_amount ?? 0))}`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                          </Button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="size-4" /> Registo actualizado no {activeYearLabel}.
            </p>
          </section>
        </div>
      </div>

      <StudentDigitalCardModal
        open={cardModalOpen}
        onOpenChange={setCardModalOpen}
        student={{
          id: student.id,
          full_name: student.full_name,
          process_number: student.registration_number,
          ...(student.class_name ? { class_name: student.class_name } : {}),
          ...(student.course_name ? { course_name: student.course_name } : {}),
          academic_year: activeYearLabel,
          photo_url: student.photo_url ?? null,
          status: estadoLabels[student.student_status] ?? student.student_status,
        }}
      />
    </AppShell>
  );
}

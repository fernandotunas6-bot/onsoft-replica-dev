import { useDeferredValue, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award,
  Download,
  FileDown,
  FileText,
  FolderOpen,
  GitMerge,
  GraduationCap,
  Pencil,
  Trash2,
  User,
  UserPlus,
} from "lucide-react";
import { whatsappHref } from "@/features/integrations/actions";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { applyLibraryPhotoToPerson } from "@/features/arquivos/apply-person-photo";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { resolveFileUrl } from "@/features/arquivos/resolve-file";
import { signSchoolFile } from "@/features/arquivos/server";
import type { SchoolFileRecord } from "@/features/arquivos/schemas";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { MediaAvatar } from "@/components/ui/media-frame";
import { IconChip } from "@/components/ui/icon-chip";
import { inferIcon } from "@/lib/auto-icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { PremiumModal } from "@/components/ui/premium-modal";
import { documentValidationCode } from "@/features/academic/assessment-views";
import {
  addPersonDocument,
  createPerson,
  createTeacher,
  deleteTeacher,
  findPersonDuplicates,
  getPerson,
  listTeachers,
  mergePeople,
  searchPeople,
  updatePerson,
  updatePersonStatus,
  updateTeacher,
} from "@/features/people/server";
import { personDocumentTypeOptions } from "@/features/people/schemas";
import { exportCsv } from "@/lib/export-csv";
import { exportOfficialPautaPdf, exportPdfTable } from "@/lib/export-pdf-loader";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { formatAngolaBi, isAngolaBiNif, validateAngolaNif } from "@/lib/angola-identity";
import { AngolaPhoneField } from "@/components/forms/AngolaPhoneField";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";
import { PersonProfile360Modal } from "@/features/people/components/PersonProfile360Modal";
import { PersonWizardModal } from "@/features/people/components/PersonWizardModal";

export const Route = createFileRoute("/pessoas/")({
  head: () => ({
    meta: [
      { title: "Pessoas · SIGA" },
      {
        name: "description",
        content:
          "Registo central de pessoas: alunos, encarregados, professores e funcionários — um único registo por pessoa, com vários papéis.",
      },
    ],
  }),
  component: PeoplePage,
});

const statusLabels: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
};

const roleLabels: Record<string, string> = {
  aluno: "Aluno",
  encarregado: "Encarregado",
  professor: "Professor",
  funcionario: "Funcionário",
  diretor: "Director",
  coordenador: "Coordenador",
  utilizador: "Utilizador",
  fornecedor: "Fornecedor",
  contacto_institucional: "Contacto institucional",
};

const documentTypeLabels: Record<string, string> = {
  bi: "BI",
  passaporte: "Passaporte",
  cedula: "Cédula",
  outro: "Outro",
};

const pessoasFilterDefaults = {
  q: "",
  teacherStatus: "all",
  personStatus: "todos",
};

function PeoplePage() {
  const queryClient = useQueryClient();
  const { school, selectedYearLabel } = useSchoolSettings();
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");
  const copyResendEmail = async (name: string, email: string) => {
    await navigator.clipboard.writeText(`SIGA · ${name}\n${email}`);
    toast.success("E-mail copiado para Resend");
  };
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "pessoas",
    pessoasFilterDefaults,
  );
  const deferredQuery = useDeferredValue(filters.q.trim());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [profile360Id, setProfile360Id] = useState<string | null>(null);
  const [pendingDocFile, setPendingDocFile] = useState<{ id: string; name: string } | null>(null);

  const peopleQuery = useQuery({
    queryKey: ["people", "search", deferredQuery],
    queryFn: () => searchPeople({ data: { query: deferredQuery, limit: 50 } }),
    placeholderData: (previous) => previous,
  });

  const teachersQuery = useQuery({
    queryKey: ["people", "teachers", filters.q, filters.teacherStatus],
    queryFn: () =>
      listTeachers({
        data: {
          query: filters.q || undefined,
          status: filters.teacherStatus as "all" | "active" | "inactive",
          limit: 100,
        },
      }),
  });

  const personQuery = useQuery({
    queryKey: ["people", "detail", selectedId],
    queryFn: () => getPerson({ data: { id: selectedId! } }),
    enabled: Boolean(selectedId),
  });

  const handleCreatePerson = async (values: Record<string, string>) => {
    const duplicates = await findPersonDuplicates({
      data: {
        fullName: values["nome"] ?? "",
        birthDate: values["nascimento"] || undefined,
        phone: values["telefone"] || undefined,
        email: values["email"] || undefined,
      },
    });
    const strongMatch = duplicates.find((d) => d.score >= 0.9);
    if (strongMatch) {
      throw new Error(
        `Possível duplicado encontrado: ${strongMatch.full_name} (motivo: ${strongMatch.match_reason}). Pesquisa por essa pessoa antes de criar um novo registo.`,
      );
    }

    if (values["nif"]?.trim()) {
      const nifCheck = validateAngolaNif(values["nif"]);
      if (!nifCheck.ok) {
        throw new Error(nifCheck.error ?? "NIF/BI inválido.");
      }
    }

    await createPerson({
      data: {
        person: {
          full_name: values["nome"] ?? "",
          birth_date: values["nascimento"] || undefined,
          email: values["email"] || undefined,
          phone_primary: values["telefone"] || undefined,
          nif: values["nif"] || undefined,
        },
        roles: values["papel"] && values["papel"] !== "—" ? [values["papel"] as never] : [],
        documents: [],
        relationships: [],
        duplicateDecision:
          duplicates.length > 0
            ? `Criado apesar de ${duplicates.length} correspondência(s) fraca(s) (nome semelhante).`
            : undefined,
      },
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["people", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["people", "teachers"] }),
    ]);
  };

  const person = personQuery.data;
  const people = (peopleQuery.data ?? []).filter(
    (row) => filters.personStatus === "todos" || row.status === filters.personStatus,
  );
  const personOptionFor = (row: { full_name: string; id: string }) =>
    `${row.full_name} · ${row.id.slice(0, 8)}`;
  const personOptions = people.map(personOptionFor);
  const teachers = teachersQuery.data ?? [];
  const peopleExportColumns = [
    { label: "Nome", value: (row: (typeof people)[number]) => String(row.full_name ?? "") },
    { label: "Email", value: (row: (typeof people)[number]) => String(row.email ?? "") },
    { label: "Telefone", value: (row: (typeof people)[number]) => String(row.phone_primary ?? "") },
    {
      label: "Estado",
      value: (row: (typeof people)[number]) => statusLabels[row.status] ?? row.status,
    },
  ];
  const exportarRegistoOficial = () => {
    void issuePrintDocument({
      tipo: "Registo de pessoas",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif,
        phone: school?.phone,
        email: school?.email,
        address: school?.address,
        directorName: school?.director_name,
        academicYear: selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year,
      },
      overlay: overlayServico({
        name: "Registo de pessoas",
        areaLabel: "Secretaria",
        reference: `PES-${people.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Pessoas",
            rows: people.map((row) => ({
              label: row.full_name,
              value: row.email || row.phone_primary || "—",
              note: statusLabels[row.status] ?? row.status,
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "pessoas-oficial",
          "Registo de pessoas",
          {
            schoolName: school?.name ?? "Escola",
            academicYear:
              selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "",
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              selectedYearLabel,
              String(people.length),
            ]),
          },
          peopleExportColumns,
          people,
        ),
    });
  };
  const teacherExportColumns = [
    {
      label: "Nº",
      value: (row: (typeof teachers)[number]) => String(row.employee_number ?? ""),
    },
    { label: "Nome", value: (row: (typeof teachers)[number]) => String(row.full_name ?? "") },
    { label: "Email", value: (row: (typeof teachers)[number]) => String(row.email ?? "") },
    { label: "Telefone", value: (row: (typeof teachers)[number]) => String(row.phone ?? "") },
    { label: "Estado", value: (row: (typeof teachers)[number]) => String(row.status ?? "") },
  ];
  const exportarProfessoresOficial = () => {
    void issuePrintDocument({
      tipo: "Professores",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif,
        phone: school?.phone,
        email: school?.email,
        address: school?.address,
        directorName: school?.director_name,
        academicYear: selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year,
      },
      overlay: overlayServico({
        name: "Corpo docente",
        areaLabel: "Pessoas",
        reference: `DOC-${teachers.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Professores",
            rows: teachers.map((row) => ({
              label: row.full_name,
              value: row.employee_number || row.email || "—",
              note: row.status === "inactive" ? "Inactivo" : "Activo",
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "professores-oficial",
          "Corpo docente",
          {
            schoolName: school?.name ?? "Escola",
            academicYear:
              selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "",
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
          },
          teacherExportColumns,
          teachers,
        ),
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <InstalledModuleTools module="comunicacoes" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <IconChip {...inferIcon("Pessoas")} size="lg" />
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">
                Pessoas
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Registo central — cada pessoa existe uma única vez, com os papéis que acumula.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => exportCsv("professores-filtrados", teacherExportColumns, teachers)}
            >
              <Download className="size-4" /> Prof. CSV
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() =>
                exportPdfTable(
                  "professores-filtrados",
                  "Professores",
                  teacherExportColumns,
                  teachers,
                  `Filtros activos: ${activeCount || "nenhum"}`,
                )
              }
            >
              <FileDown className="size-4" /> Prof. PDF
            </Button>
            <Button variant="outline" className="gap-2" onClick={exportarProfessoresOficial}>
              <Award className="size-4" /> Oficial
            </Button>
            <QuickFormModal
              title="Novo professor"
              eyebrow="Corpo docente"
              description="Cria a pessoa e o registo de professor no SGA."
              icon={<GraduationCap className="size-5" />}
              submitLabel="Criar professor"
              onSubmit={async (values) => {
                await createTeacher({
                  data: {
                    fullName: values["nome"] ?? "",
                    email: values["email"] || undefined,
                    phone: values["telefone"] || undefined,
                    employeeNumber: values["numero"] || undefined,
                    hiredOn: values["contratacao"] || undefined,
                  },
                });
                await queryClient.invalidateQueries({ queryKey: ["people", "teachers"] });
                await queryClient.invalidateQueries({ queryKey: ["people", "search"] });
              }}
              fields={[
                { name: "nome", label: "Nome completo", full: true },
                { name: "email", label: "Email", required: false },
                { name: "telefone", label: "Telefone", required: false },
                {
                  name: "numero",
                  label: "Nº funcionário",
                  placeholder: "DOC-000002",
                  required: false,
                },
                {
                  name: "contratacao",
                  label: "Data de contratação",
                  type: "date",
                  required: false,
                },
              ]}
              trigger={(open) => (
                <Button variant="outline" className="gap-2" onClick={open}>
                  <GraduationCap className="size-4" /> Novo professor
                </Button>
              )}
            />
            <QuickFormModal
              title="Nova pessoa"
              eyebrow="Registo central"
              description="Antes de criar, verificamos automaticamente se já existe alguém com dados semelhantes."
              icon={<UserPlus className="size-5" />}
              size="lg"
              submitLabel="Criar pessoa"
              note="Documentos, endereço e relações associam-se depois no perfil da pessoa."
              onSubmit={handleCreatePerson}
              fields={[
                {
                  name: "nome",
                  label: "Nome completo",
                  placeholder: "Ex.: João Manuel",
                  full: true,
                },
                { name: "nascimento", label: "Data de nascimento", type: "date", required: false },
                {
                  name: "telefone",
                  label: "Telefone",
                  placeholder: "+244 9xx xxx xxx",
                  required: false,
                },
                { name: "email", label: "Email", placeholder: "nome@exemplo.com", required: false },
                {
                  name: "nif",
                  label: "NIF / BI",
                  type: "angola-identity",
                  required: false,
                  full: true,
                },
                {
                  name: "papel",
                  label: "Papel inicial",
                  type: "select",
                  required: false,
                  options: Object.keys(roleLabels),
                },
              ]}
              trigger={() => (
                <Button className="gap-2 shadow-sm" onClick={() => setWizardOpen(true)}>
                  <UserPlus className="size-4" /> Nova Pessoa
                </Button>
              )}
            />
            <QuickFormModal
              title="Mesclar duplicado"
              eyebrow="Registo central"
              description="Mantém a ficha sobrevivente, transfere aluno/professor se só o duplicado os tiver, e desactiva o outro registo."
              icon={<GitMerge className="size-5" />}
              submitLabel="Mesclar"
              note="Se ambas as fichas forem alunos ou ambas professores, a operação é recusada."
              successDescription="Duplicado desactivado e ligações transferidas."
              onSubmit={async (values) => {
                const survivor = people.find(
                  (row) => personOptionFor(row) === values["sobrevivente"],
                );
                const duplicate = people.find(
                  (row) => personOptionFor(row) === values["duplicado"],
                );
                if (!survivor || !duplicate) {
                  throw new Error("Seleccione a ficha sobrevivente e o duplicado.");
                }
                try {
                  await mergePeople({
                    data: {
                      survivorId: survivor.id,
                      duplicateId: duplicate.id,
                      reason: values["motivo"] ?? "",
                    },
                  });
                } catch (error) {
                  toast.error("Mesclagem falhou", {
                    description: error instanceof Error ? error.message : "Tenta novamente.",
                    duration: 15000,
                  });
                  throw error;
                }
                setSelectedId(null);
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["people", "search"] }),
                  queryClient.invalidateQueries({ queryKey: ["people", "teachers"] }),
                  queryClient.invalidateQueries({ queryKey: ["people", "detail"] }),
                ]);
              }}
              fields={[
                {
                  name: "sobrevivente",
                  label: "Ficha que fica",
                  type: "select",
                  options: personOptions,
                  full: true,
                },
                {
                  name: "duplicado",
                  label: "Duplicado a desactivar",
                  type: "select",
                  options: personOptions,
                  full: true,
                },
                {
                  name: "motivo",
                  label: "Motivo",
                  placeholder: "Ex.: mesmo telefone e nome",
                  full: true,
                },
              ]}
              trigger={(open) => (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={open}
                  disabled={people.length < 2}
                >
                  <GitMerge className="size-4" /> Mesclar
                </Button>
              )}
            />
          </div>
        </div>

        <ListFilterBar
          values={filters}
          activeCount={activeCount}
          onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
          onReset={resetFilters}
          fields={[
            {
              name: "q",
              placeholder: "Pesquisar pessoas e professores…",
              "aria-label": "Pesquisar pessoa",
            },
            {
              name: "teacherStatus",
              type: "select",
              label: "Professores",
              emptyValue: "all",
              options: [
                { value: "all", label: "Todos" },
                { value: "active", label: "Activos" },
                { value: "inactive", label: "Inactivos" },
              ],
            },
            {
              name: "personStatus",
              type: "select",
              label: "Pessoas",
              emptyValue: "todos",
              options: [
                { value: "todos", label: "Todos os estados" },
                { value: "active", label: "Activas" },
                { value: "inactive", label: "Inactivas" },
              ],
            },
          ]}
        />

        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-display text-base font-bold">Professores</h2>
            <p className="text-xs text-muted-foreground">
              Criar, editar e desactivar docentes — filtros persistentes entre rotas.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachersQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      A carregar professores…
                    </TableCell>
                  </TableRow>
                ) : teachers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhum professor neste filtro.
                    </TableCell>
                  </TableRow>
                ) : (
                  teachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-mono text-xs">{teacher.employee_number}</TableCell>
                      <TableCell className="font-semibold">{teacher.full_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          {teacher.email ?? teacher.phone ?? "—"}
                          {whatsappOn && teacher.phone ? (
                            <a
                              href={whatsappHref(teacher.phone)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-semibold text-primary hover:underline"
                            >
                              WhatsApp
                            </a>
                          ) : null}
                          {resendOn && teacher.email ? (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-primary hover:underline"
                              onClick={() =>
                                void copyResendEmail(teacher.full_name, teacher.email!)
                              }
                            >
                              E-mail
                            </button>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell>{statusLabels[teacher.status] ?? teacher.status}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/professores/$teacherId" params={{ teacherId: teacher.id }}>
                              Ficha
                            </Link>
                          </Button>
                          <QuickFormModal
                            title="Editar professor"
                            eyebrow="Corpo docente"
                            description="Actualize nome, contacto e estado."
                            icon={<Pencil className="size-5" />}
                            submitLabel="Guardar"
                            onSubmit={async (values) => {
                              await updateTeacher({
                                data: {
                                  teacherId: teacher.id,
                                  fullName: values["nome"] ?? teacher.full_name,
                                  email: values["email"] || undefined,
                                  phone: values["telefone"] || undefined,
                                  status: values["estado"] === "Inactivo" ? "inactive" : "active",
                                },
                              });
                              await queryClient.invalidateQueries({
                                queryKey: ["people", "teachers"],
                              });
                            }}
                            fields={[
                              {
                                name: "nome",
                                label: "Nome",
                                defaultValue: teacher.full_name,
                                full: true,
                              },
                              {
                                name: "email",
                                label: "Email",
                                defaultValue: teacher.email ?? "",
                                required: false,
                              },
                              {
                                name: "telefone",
                                label: "Telefone",
                                defaultValue: teacher.phone ?? "",
                                required: false,
                              },
                              {
                                name: "estado",
                                label: "Estado",
                                type: "select",
                                options: ["Activo", "Inactivo"],
                                defaultValue: teacher.status === "inactive" ? "Inactivo" : "Activo",
                              },
                            ]}
                            trigger={(open) => (
                              <Button size="sm" variant="ghost" onClick={open}>
                                <Pencil className="size-3.5" />
                              </Button>
                            )}
                          />
                          <ConfirmActionModal
                            title="Desactivar professor"
                            description={`${teacher.full_name} será marcado como inactivo.`}
                            confirmLabel="Desactivar"
                            onConfirm={async () => {
                              await deleteTeacher({ data: { teacherId: teacher.id } });
                              await queryClient.invalidateQueries({
                                queryKey: ["people", "teachers"],
                              });
                            }}
                            trigger={(open) => (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={open}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="font-display text-base font-bold">Registo central</h2>
              <p className="text-xs text-muted-foreground">
                Pessoas da escola — clique numa linha para ver a ficha.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => exportCsv("pessoas-filtradas", peopleExportColumns, people)}
                disabled={!people.length}
              >
                <Download className="size-3.5" /> CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() =>
                  exportPdfTable(
                    "pessoas-filtradas",
                    "Registo de pessoas",
                    peopleExportColumns,
                    people,
                    `Filtros activos: ${activeCount || "nenhum"}`,
                  )
                }
                disabled={!people.length}
              >
                <FileDown className="size-3.5" /> PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={exportarRegistoOficial}
                disabled={!people.length}
              >
                <Award className="size-3.5" /> Oficial
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {peopleQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      A carregar…
                    </TableCell>
                  </TableRow>
                ) : peopleQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-destructive">
                      Não foi possível pesquisar pessoas:{" "}
                      {peopleQuery.error instanceof Error
                        ? peopleQuery.error.message
                        : "erro desconhecido"}
                    </TableCell>
                  </TableRow>
                ) : (peopleQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma pessoa encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  (peopleQuery.data ?? []).map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer transition-colors hover:bg-secondary/50"
                      onClick={() => setProfile360Id(row.id)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setProfile360Id(row.id);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <MediaAvatar
                            src={typeof row.photo_url === "string" ? row.photo_url : null}
                            alt={row.full_name}
                            fallback={row.full_name.slice(0, 2).toUpperCase()}
                            className="size-9 rounded-xl object-cover shadow-2xs"
                          />
                          <p className="font-semibold text-foreground">{row.full_name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          {row.email ?? "—"}
                          {resendOn && row.email ? (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-primary hover:underline"
                              onClick={(event) => {
                                event.stopPropagation();
                                void copyResendEmail(row.full_name, row.email!);
                              }}
                            >
                              E-mail
                            </button>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="inline-flex items-center gap-2">
                          {row.phone_primary ?? "—"}
                          {whatsappOn && row.phone_primary ? (
                            <a
                              href={whatsappHref(row.phone_primary)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-semibold text-primary hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              WhatsApp
                            </a>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {statusLabels[row.status] ?? row.status}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <PremiumModal
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setPendingDocFile(null);
          }
        }}
        eyebrow="Registo central"
        title={person?.full_name ?? "Ficha da pessoa"}
        description="Consulta rápida dos dados pessoais guardados."
        icon={<User className="size-5" />}
        footer={
          <>
            {person ? (
              <QuickFormModal
                title="Editar pessoa"
                description="Actualiza o nome e os contactos desta ficha."
                icon={<Pencil className="size-5" />}
                submitLabel="Guardar"
                successDescription="Ficha actualizada."
                onSubmit={async (values) => {
                  await updatePerson({
                    data: {
                      personId: person.id,
                      fullName: values["nome"] ?? person.full_name,
                      email: values["email"] || undefined,
                      phone: values["telefone"] || undefined,
                      nif: values["nif"] || undefined,
                    },
                  });
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["people", "search"] }),
                    queryClient.invalidateQueries({ queryKey: ["people", "detail"] }),
                    queryClient.invalidateQueries({ queryKey: ["people", "teachers"] }),
                  ]);
                }}
                fields={[
                  {
                    name: "nome",
                    label: "Nome",
                    defaultValue: person.full_name,
                    full: true,
                  },
                  {
                    name: "email",
                    label: "Email",
                    defaultValue: person.email ?? "",
                    required: false,
                  },
                  {
                    name: "telefone",
                    label: "Telefone",
                    defaultValue: person.phone_primary ?? "",
                    required: false,
                  },
                  {
                    name: "nif",
                    label: "NIF / BI",
                    type: "angola-identity",
                    defaultValue: person.nif ?? "",
                    required: false,
                    full: true,
                  },
                ]}
                trigger={(open) => (
                  <Button variant="outline" className="gap-1.5" onClick={open}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                )}
              />
            ) : null}
            {person ? (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const next = person.status === "inactive" ? "active" : "inactive";
                    await updatePersonStatus({
                      data: { personId: person.id, status: next },
                    });
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["people", "search"] }),
                      queryClient.invalidateQueries({ queryKey: ["people", "detail"] }),
                    ]);
                    toast.success(next === "inactive" ? "Pessoa desactivada" : "Pessoa reactivada");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Não foi possível alterar o estado.",
                    );
                  }
                }}
              >
                {person.status === "inactive" ? "Reactivar" : "Desactivar"}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setSelectedId(null)}>
              Fechar
            </Button>
          </>
        }
      >
        {personQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar ficha…</p>
        ) : personQuery.isError ? (
          <p className="text-sm text-destructive">
            {personQuery.error instanceof Error
              ? personQuery.error.message
              : "Não foi possível carregar a pessoa."}
          </p>
        ) : person ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              <MediaAvatar
                src={typeof person.photo_url === "string" ? person.photo_url : null}
                alt={person.full_name}
                fallback={person.full_name}
                className="size-14 rounded-2xl text-lg"
              />
              {school?.id ? (
                <PickFileButton
                  label="Foto da biblioteca"
                  area="secretaria"
                  acceptKinds={["png", "jpeg"]}
                  variant="outline"
                  size="sm"
                  onPick={(file) => {
                    void (async () => {
                      try {
                        await applyLibraryPhotoToPerson({
                          personId: person.id,
                          schoolId: school.id,
                          file,
                        });
                        await queryClient.invalidateQueries({
                          queryKey: ["people", "detail", person.id],
                        });
                        toast.success("Foto actualizada a partir da biblioteca");
                      } catch (error) {
                        toast.error("Não foi possível actualizar a foto", {
                          description: error instanceof Error ? error.message : "Tente novamente.",
                        });
                      }
                    })();
                  }}
                />
              ) : null}
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {person.email ?? "—"}
                  {resendOn && person.email ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary hover:underline"
                        onClick={() => void copyResendEmail(person.full_name, person.email!)}
                      >
                        E-mail Resend
                      </button>
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Telefone
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {person.phone_primary ? (
                    <AngolaPhoneField
                      id={`person-phone-${person.id}`}
                      defaultValue={person.phone_primary}
                      disabled
                    />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  NIF
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {person.nif
                    ? isAngolaBiNif(person.nif)
                      ? formatAngolaBi(person.nif)
                      : person.nif
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Estado
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {statusLabels[person.status] ?? person.status}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Morada
                </dt>
                <dd className="mt-1 text-sm font-medium">{person.address ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Documentos
                </dt>
                <dd className="space-y-3">
                  {(person.documents ?? []).length ? (
                    <ul className="space-y-2">
                      {(person.documents ?? []).map(
                        (document: {
                          id: string;
                          document_type: string;
                          document_number: string;
                          issued_at: string | null;
                          expires_at: string | null;
                          file_id: string | null;
                          file_name: string | null;
                        }) => (
                          <li
                            key={document.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
                          >
                            <span className="min-w-0">
                              <span className="block font-medium">
                                {documentTypeLabels[document.document_type] ??
                                  document.document_type}
                              </span>
                              <span className="font-mono text-xs">
                                {document.document_type === "bi"
                                  ? formatAngolaBi(document.document_number)
                                  : document.document_number}
                              </span>
                              {document.file_name ? (
                                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                  {document.file_name}
                                </span>
                              ) : null}
                            </span>
                            {document.file_id ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                onClick={() => {
                                  void (async () => {
                                    try {
                                      const signed = await signSchoolFile({
                                        data: { id: String(document.file_id) },
                                      });
                                      if (signed.url) {
                                        window.open(signed.url, "_blank", "noopener,noreferrer");
                                        return;
                                      }
                                      const stub = {
                                        id: String(document.file_id),
                                        storageBackend: "local",
                                        kind: "pdf",
                                      } as SchoolFileRecord;
                                      const url = await resolveFileUrl(stub);
                                      window.open(url, "_blank", "noopener,noreferrer");
                                    } catch (error) {
                                      toast.error("Não foi possível abrir o anexo", {
                                        description:
                                          error instanceof Error
                                            ? error.message
                                            : "Tente novamente.",
                                      });
                                    }
                                  })();
                                }}
                              >
                                <FolderOpen className="size-3.5" /> Abrir
                              </Button>
                            ) : null}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum documento registado.</p>
                  )}
                  <QuickFormModal
                    title="Adicionar documento"
                    description="Registe BI, passaporte ou outro documento de identificação."
                    icon={<FileText className="size-5" />}
                    submitLabel="Guardar documento"
                    successDescription="Documento associado à ficha."
                    onSubmit={async (values) => {
                      await addPersonDocument({
                        data: {
                          personId: person.id,
                          document: {
                            document_type: values[
                              "tipo"
                            ] as (typeof personDocumentTypeOptions)[number],
                            document_number: values["numero"] ?? "",
                            issued_at: values["emissao"] || undefined,
                            expires_at: values["validade"] || undefined,
                            file_id: pendingDocFile?.id,
                            file_name: pendingDocFile?.name,
                          },
                        },
                      });
                      setPendingDocFile(null);
                      await queryClient.invalidateQueries({
                        queryKey: ["people", "detail", person.id],
                      });
                    }}
                    fields={[
                      {
                        name: "tipo",
                        label: "Tipo",
                        type: "select",
                        options: [...personDocumentTypeOptions],
                        defaultValue: "bi",
                        full: true,
                      },
                      {
                        name: "numero",
                        label: "Número",
                        placeholder: "Número do documento",
                        full: true,
                      },
                      {
                        name: "emissao",
                        label: "Data de emissão",
                        type: "date",
                        required: false,
                      },
                      {
                        name: "validade",
                        label: "Validade",
                        type: "date",
                        required: false,
                      },
                    ]}
                    trigger={(open) => (
                      <div className="flex flex-wrap items-center gap-2">
                        <PickFileButton
                          label={pendingDocFile ? pendingDocFile.name : "Anexar PDF"}
                          area="secretaria"
                          acceptKinds={["pdf", "png", "jpeg"]}
                          variant="outline"
                          size="sm"
                          onPick={(file) => {
                            setPendingDocFile({ id: file.id, name: file.name });
                            toast.message("Anexo seleccionado", {
                              description: "Complete o formulário e guarde o documento.",
                            });
                          }}
                        />
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={open}>
                          <FileText className="size-3.5" /> Adicionar documento
                        </Button>
                      </div>
                    )}
                  />
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </PremiumModal>

      <PersonWizardModal
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onPersonCreated={(personId, action) => {
          if (action === "view") {
            setProfile360Id(personId);
          } else if (action === "enroll") {
            window.location.href = `/alunos?action=matricular&personId=${personId}`;
          }
        }}
      />

      <PersonProfile360Modal
        personId={profile360Id}
        open={Boolean(profile360Id)}
        onOpenChange={(val) => {
          if (!val) setProfile360Id(null);
        }}
        onOpenEnrollment={(pId) => {
          window.location.href = `/alunos?action=matricular&personId=${pId}`;
        }}
      />
    </AppShell>
  );
}

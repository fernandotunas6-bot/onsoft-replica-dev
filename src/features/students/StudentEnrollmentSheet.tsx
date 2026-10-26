import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";
import { AngolaPhoneField } from "@/components/forms/AngolaPhoneField";
import { Textarea } from "@/components/ui/textarea";
import {
  SequentialSheetModal,
  SheetCell,
  SheetGrid,
} from "@/components/modals/SequentialSheetModal";
import { personRelationshipTypeOptions } from "@/features/people/schemas";
import { findPersonDuplicates, searchPeople } from "@/features/people/server";
import { enrollNewStudent, enrollStudentInClass } from "@/features/students/server";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { Link } from "@tanstack/react-router";
import { academicStatusLabel } from "@/features/students/academic-status";
import {
  matchExistingStudents,
  type ExistingStudentOption,
} from "@/features/students/existing-student-match";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { EducationWorkflowVisual } from "@/components/workflows/EducationWorkflowVisual";
import {
  buildEnrollmentDirectory,
  formatEnrollmentClassGroupLabel,
  type EnrollmentClassGroup,
} from "@/features/students/enrollment-directory";
import { angolaProvinces } from "@/lib/angola-territory";
import { useEnrollmentWindow } from "@/features/enrollment/use-enrollment-window";

const steps = [
  { id: "identidade", label: "Identidade", description: "Dados pessoais do aluno." },
  { id: "contactos", label: "Contactos", description: "Telefone, email e morada." },
  { id: "encarregado", label: "Encarregado", description: "Responsável já existente na escola." },
  { id: "turma", label: "Matrícula", description: "Processo e turma do ano lectivo." },
  { id: "revisao", label: "Revisão", description: "Confirme antes de gravar." },
];

const relationshipLabels: Record<string, string> = {
  pai: "Pai",
  mae: "Mãe",
  encarregado: "Encarregado",
  tutor: "Tutor",
  conjuge: "Cônjuge",
  irmao: "Irmão",
  contacto_emergencia: "Contacto de emergência",
  responsavel_financeiro: "Responsável financeiro",
  responsavel_autorizado_buscar: "Autorizado a buscar",
};

const fieldClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type ClassGroupOption = EnrollmentClassGroup;

type PersonOption = { id: string; full_name: string; status?: string };

const emptyValues = {
  nome: "",
  nascimento: "",
  genero: "",
  nif: "",
  telefone: "",
  email: "",
  provincia: "",
  municipio: "",
  comuna: "",
  morada: "",
  obs: "",
  academicYearId: "",
  courseId: "",
  gradeName: "",
  shift: "",
  roomName: "",
  turmaId: "",
  encarregadoId: "",
  parentesco: "encarregado",
  motivoCiclo: "",
};

export function StudentEnrollmentSheet({
  trigger,
  autoOpen = false,
  classGroups,
  people,
  existingStudents = [],
  onCreated,
}: {
  trigger: (open: () => void) => ReactNode;
  autoOpen?: boolean;
  classGroups: ClassGroupOption[];
  people: PersonOption[];
  /** Alunos da escola, para oferecer o existente em vez de criar outro. */
  existingStudents?: readonly ExistingStudentOption[];
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(autoOpen);
  const requestId = useRef("");
  const installed = useInstalledIntegrations();
  const enrollmentWindow = useEnrollmentWindow();
  const resendOn = installed.hasCapability("resend.send");
  const [values, setValues] = useState(emptyValues);
  const [guardianQuery, setGuardianQuery] = useState("");
  const [guardianResults, setGuardianResults] = useState<PersonOption[]>([]);
  const [searchingGuardians, setSearchingGuardians] = useState(false);
  // Aluno existente escolhido na folha: abre a matrícula curta (só a turma).
  const [existing, setExisting] = useState<{ student: ExistingStudentOption; key: number } | null>(
    null,
  );

  // Fecho sem gravar (cancelado ou X) não deve deixar dados da tentativa
  // anterior visíveis da próxima vez que a folha abrir.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      requestId.current = "";
      setValues(emptyValues);
      setGuardianQuery("");
      setGuardianResults([]);
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    const query = guardianQuery.trim();
    if (query.length < 2) {
      setGuardianResults([]);
      setSearchingGuardians(false);
      return;
    }
    let cancelled = false;
    setSearchingGuardians(true);
    const timer = window.setTimeout(async () => {
      try {
        const rows = await searchPeople({ data: { query, limit: 20 } });
        if (!cancelled) {
          setGuardianResults(
            rows.map((row) => ({
              id: row.id,
              full_name: row.full_name,
              status: row.status,
            })),
          );
        }
      } catch {
        if (!cancelled) setGuardianResults([]);
      } finally {
        if (!cancelled) setSearchingGuardians(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [guardianQuery]);

  const hasUnsavedChanges = values.nome.trim() !== "";
  const existingMatches = useMemo(
    () =>
      matchExistingStudents(existingStudents, {
        name: values.nome,
        nationalId: values.nif,
        phone: values.telefone,
      }),
    [existingStudents, values.nome, values.nif, values.telefone],
  );

  const directory = useMemo(
    () =>
      buildEnrollmentDirectory(classGroups, {
        academicYearId: values.academicYearId || undefined,
        courseId: values.courseId || undefined,
        gradeName: values.gradeName || undefined,
        shift: values.shift || undefined,
        roomName: values.roomName || undefined,
      }),
    [
      classGroups,
      values.academicYearId,
      values.courseId,
      values.gradeName,
      values.shift,
      values.roomName,
    ],
  );
  const turmaOptions = useMemo(
    () =>
      directory.classGroups.map((group) => ({
        id: group.id,
        label: formatEnrollmentClassGroupLabel(group),
        academicYearId: group.academic_year_id,
      })),
    [directory.classGroups],
  );
  const selectedTurma = useMemo(
    () => directory.classGroups.find((group) => group.id === values.turmaId) ?? null,
    [directory.classGroups, values.turmaId],
  );
  const guardians = useMemo(
    () =>
      (guardianQuery.trim().length >= 2 ? guardianResults : people).filter(
        (row) => row.status !== "inactive",
      ),
    [guardianQuery, guardianResults, people],
  );

  const setField = (name: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <SequentialSheetModal
        open={open}
        onOpenChange={setOpen}
        eyebrow="Secretaria"
        title="Nova matrícula"
        description="Folha sequencial com todos os dados do aluno antes de gravar na escola."
        icon={<UserPlus className="size-5" />}
        steps={steps}
        submitLabel="Criar matrícula"
        successDescription="Aluno criado. A ficha fica disponível na lista."
        visualPanel={({ stepId }) => (
          <EducationWorkflowVisual
            scene={
              stepId === "encarregado"
                ? "guardian"
                : stepId === "turma"
                  ? "classroom"
                  : stepId === "revisao"
                    ? "enrollment"
                    : "people"
            }
            title={
              stepId === "turma"
                ? "Escolha o contexto académico"
                : stepId === "encarregado"
                  ? "Ligue o responsável certo"
                  : values.nome
                    ? `Organizar ${values.nome}`
                    : undefined
            }
          />
        )}
        onSubmit={async () => {
          if (values.nome.trim().length < 2) throw new Error("Indique o nome completo.");
          const duplicates = await findPersonDuplicates({
            data: {
              fullName: values.nome,
              birthDate: values.nascimento || undefined,
              phone: values.telefone || undefined,
              email: values.email || undefined,
              nif: values.nif || undefined,
            },
          });
          const strong = duplicates.find((item) => item.score >= 0.9);
          if (strong) {
            // Aviso, não bloqueio: a 90% pode mesmo ser a mesma pessoa (então
            // o correcto é ir à ficha existente), mas também pode ser um
            // irmão com nome parecido — a decisão é do utilizador, nunca
            // perde os 5 passos já preenchidos por um bloqueio sem saída.
            const proceed = window.confirm(
              `Possível duplicado: ${strong.full_name} (${Math.round(strong.score * 100)}% de confiança, ${strong.match_reason}).\n\nSe for a mesma pessoa, cancele e use a ficha existente em Pessoas.\n\nContinuar e criar esta matrícula mesmo assim?`,
            );
            if (!proceed) {
              throw new Error("Matrícula cancelada — verifique o registo existente em Pessoas.");
            }
          }
          const turma = enrollmentWindow.blocked
            ? undefined
            : classGroups.find((group) => group.id === values.turmaId);
          if (turma && enrollmentWindow.reasonField && values.motivoCiclo.trim().length < 5) {
            throw new Error("Indique o motivo da matrícula fora do ciclo.");
          }
          // A lotação é uma regra da base (enroll_student): não há matrícula acima
          // dela. O ecrã oferecia «continuar com a matrícula extraordinária», que
          // depois falhava com o aluno já criado e sem turma.
          if (
            turma &&
            typeof turma.capacity === "number" &&
            turma.capacity > 0 &&
            (turma.enrolled_count ?? 0) >= turma.capacity
          ) {
            throw new Error(
              `A turma «${turma.name}» atingiu a lotação máxima. Seleccione outra turma com vagas disponíveis.`,
            );
          }
          const relationship = values.parentesco || "encarregado";
          requestId.current ||= crypto.randomUUID();
          await enrollNewStudent({
            data: {
              requestId: requestId.current,
              person: {
                full_name: values.nome,
                birth_date: values.nascimento || undefined,
                sex:
                  values.genero === "F" || values.genero === "M" || values.genero === "outro"
                    ? values.genero
                    : undefined,
                phone_primary: values.telefone || undefined,
                email: values.email || undefined,
                province: values.provincia || undefined,
                municipality: values.municipio || undefined,
                commune: values.comuna || undefined,
                address: values.morada || undefined,
                nif: values.nif || undefined,
                notes: values.obs || undefined,
              },
              classGroupId: turma?.id,
              academicYearId: turma?.academic_year_id || undefined,
              outsideCycleReason: turma ? values.motivoCiclo || undefined : undefined,
              guardians:
                values.encarregadoId && relationship
                  ? [
                      {
                        guardian_person_id: values.encarregadoId,
                        relationship,
                        is_primary: true,
                        authorized_pickup: true,
                      },
                    ]
                  : [],
              duplicateDecision:
                duplicates.length > 0
                  ? `Matrícula criada após ${duplicates.length} correspondência(s) fraca(s).`
                  : undefined,
            },
          });
          await onCreated();
          setValues(emptyValues);
        }}
        hasUnsavedChanges={hasUnsavedChanges}
      >
        {({ stepId }) => {
          if (stepId === "identidade") {
            return (
              <SheetGrid>
                <SheetCell label="Nome completo" full>
                  <Input
                    aria-label="Nome completo"
                    value={values.nome}
                    onChange={(e) => setField("nome", e.target.value)}
                  />
                </SheetCell>
                <SheetCell label="Data de nascimento">
                  <Input
                    aria-label="Data de nascimento"
                    type="date"
                    value={values.nascimento}
                    onChange={(e) => setField("nascimento", e.target.value)}
                  />
                </SheetCell>
                <SheetCell label="Género">
                  <select
                    aria-label="Género"
                    className={fieldClass}
                    value={values.genero}
                    onChange={(e) => setField("genero", e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                    <option value="outro">Outro</option>
                  </select>
                </SheetCell>
                <SheetCell label="NIF / BI" full>
                  <AngolaIdentityField
                    id="enroll-nif"
                    value={values.nif}
                    onChange={(next) => setField("nif", next)}
                  />
                </SheetCell>
                {existingMatches.length ? (
                  // Não é um SheetCell: esse é um <label>, e o clique em qualquer parte dele
                  // carregaria no primeiro botão da lista.
                  <div className="block min-w-0 bg-card px-4 py-4 sm:col-span-2">
                    <p className="mb-2 text-[12px] font-medium leading-[20px] text-muted-foreground">
                      Já é aluno desta escola?
                    </p>
                    <ul aria-label="Alunos existentes" className="divide-y rounded-md border">
                      {existingMatches.map(({ student, reason }) => (
                        <li
                          key={student.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{student.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {[
                                student.registration_number
                                  ? `Nº ${student.registration_number}`
                                  : null,
                                [student.grade_name, student.class_name]
                                  .filter(Boolean)
                                  .join(" · ") || "Sem turma",
                                student.academic_year,
                                academicStatusLabel(student.student_status),
                                reason === "bi"
                                  ? "mesmo BI/NIF"
                                  : reason === "telefone"
                                    ? "mesmo telefone"
                                    : "nome parecido",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Link
                              to="/alunos/$studentId"
                              params={{ studentId: student.id }}
                              className="text-xs font-semibold text-muted-foreground hover:underline"
                            >
                              Abrir ficha
                            </Link>
                            <button
                              type="button"
                              className="text-xs font-semibold text-primary hover:underline"
                              onClick={() => {
                                setExisting((prev) => ({ student, key: (prev?.key ?? 0) + 1 }));
                                setOpen(false);
                              }}
                            >
                              Matricular este aluno
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </SheetGrid>
            );
          }
          if (stepId === "contactos") {
            return (
              <SheetGrid>
                <SheetCell label="Telefone">
                  <AngolaPhoneField
                    id="enroll-telefone"
                    value={values.telefone}
                    onChange={(next) => setField("telefone", next)}
                  />
                </SheetCell>
                <SheetCell label="Email">
                  <Input
                    aria-label="Email"
                    type="email"
                    value={values.email}
                    onChange={(e) => setField("email", e.target.value)}
                  />
                  {resendOn && values.email.trim() ? (
                    <button
                      type="button"
                      className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          `Matrícula SIGA — ${values.nome || "novo aluno"}\nContacto: ${values.email}`,
                        );
                        toast.success("Texto copiado para e-mail Resend");
                      }}
                    >
                      Copiar convite Resend
                    </button>
                  ) : null}
                </SheetCell>
                <SheetCell label="Província">
                  <select
                    aria-label="Província"
                    className={fieldClass}
                    value={values.provincia}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        provincia: e.target.value,
                        municipio: "",
                        comuna: "",
                      }))
                    }
                  >
                    <option value="">Seleccionar província</option>
                    {angolaProvinces.map((province) => (
                      <option key={province} value={province}>
                        {province}
                      </option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Município">
                  <Input
                    aria-label="Município"
                    value={values.municipio}
                    onChange={(e) => setField("municipio", e.target.value)}
                  />
                </SheetCell>
                <SheetCell label="Comuna / Localidade">
                  <Input
                    aria-label="Comuna ou localidade"
                    value={values.comuna}
                    onChange={(e) => setField("comuna", e.target.value)}
                  />
                </SheetCell>
                <SheetCell label="Morada">
                  <Input
                    aria-label="Morada"
                    value={values.morada}
                    onChange={(e) => setField("morada", e.target.value)}
                  />
                </SheetCell>
                <SheetCell label="Observações" full>
                  <Textarea
                    aria-label="Observações"
                    placeholder="Indicações para a secretaria, guardadas no histórico da matrícula."
                    value={values.obs}
                    onChange={(e) => setField("obs", e.target.value)}
                  />
                </SheetCell>
              </SheetGrid>
            );
          }
          if (stepId === "encarregado") {
            return (
              <SheetGrid>
                <SheetCell label="Pesquisar pessoa" full>
                  <Input
                    aria-label="Pesquisar encarregado"
                    value={guardianQuery}
                    onChange={(e) => setGuardianQuery(e.target.value)}
                    placeholder="Nome, BI, telefone ou email"
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {searchingGuardians
                      ? "A pesquisar no registo de Pessoas…"
                      : guardianQuery.trim().length === 1
                        ? "Escreva pelo menos 2 caracteres."
                        : "A pesquisa usa o registo central da escola e evita carregar milhares de pessoas."}
                  </p>
                </SheetCell>
                <SheetCell label="Encarregado já registado" full>
                  <select
                    aria-label="Encarregado já registado"
                    className={fieldClass}
                    value={values.encarregadoId}
                    onChange={(e) => setField("encarregadoId", e.target.value)}
                  >
                    <option value="">Sem encarregado nesta matrícula</option>
                    {guardians.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Parentesco" full>
                  <select
                    aria-label="Parentesco"
                    className={fieldClass}
                    value={values.parentesco}
                    onChange={(e) => setField("parentesco", e.target.value)}
                  >
                    {personRelationshipTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {relationshipLabels[option] ?? option}
                      </option>
                    ))}
                  </select>
                </SheetCell>
              </SheetGrid>
            );
          }
          if (stepId === "turma") {
            return (
              <SheetGrid>
                <SheetCell label="Ano lectivo">
                  <select
                    aria-label="Ano lectivo"
                    className={fieldClass}
                    value={values.academicYearId}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        academicYearId: e.target.value,
                        courseId: "",
                        gradeName: "",
                        shift: "",
                        roomName: "",
                        turmaId: "",
                      }))
                    }
                  >
                    <option value="">Todos os anos</option>
                    {directory.academicYears.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Curso">
                  <select
                    aria-label="Curso"
                    className={fieldClass}
                    value={values.courseId}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        courseId: e.target.value,
                        gradeName: "",
                        shift: "",
                        roomName: "",
                        turmaId: "",
                      }))
                    }
                  >
                    <option value="">Todos os cursos</option>
                    {directory.courses.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Classe / nível">
                  <select
                    aria-label="Classe ou nível"
                    className={fieldClass}
                    value={values.gradeName}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        gradeName: e.target.value,
                        shift: "",
                        roomName: "",
                        turmaId: "",
                      }))
                    }
                  >
                    <option value="">Todas as classes</option>
                    {directory.grades.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Turno">
                  <select
                    aria-label="Turno"
                    className={fieldClass}
                    value={values.shift}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        shift: e.target.value,
                        roomName: "",
                        turmaId: "",
                      }))
                    }
                  >
                    <option value="">Todos os turnos</option>
                    {directory.shifts.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Sala">
                  <select
                    aria-label="Sala"
                    className={fieldClass}
                    value={values.roomName}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        roomName: e.target.value,
                        turmaId: "",
                      }))
                    }
                  >
                    <option value="">Todas as salas</option>
                    {directory.rooms.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Turma" full>
                  {enrollmentWindow.closed ? (
                    <p
                      role="status"
                      className="mb-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs"
                    >
                      {enrollmentWindow.status?.message}{" "}
                      {enrollmentWindow.blocked
                        ? "O aluno fica registado como candidato; a matrícula numa turma faz-se no ciclo de matrículas ou pela Administração."
                        : "Matrícula fora do ciclo: indique o motivo, que fica registado."}
                    </p>
                  ) : null}
                  <select
                    aria-label="Turma"
                    className={fieldClass}
                    value={enrollmentWindow.blocked ? "" : values.turmaId}
                    disabled={enrollmentWindow.blocked}
                    onChange={(e) => setField("turmaId", e.target.value)}
                  >
                    <option value="">Sem turma (só processo)</option>
                    {turmaOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {selectedTurma ? (
                    <>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {selectedTurma.room_name && selectedTurma.room_name !== "—"
                          ? `${selectedTurma.room_name} · `
                          : ""}
                        {selectedTurma.shift ? `${selectedTurma.shift} · ` : ""}
                        {typeof selectedTurma.capacity === "number"
                          ? `${selectedTurma.enrolled_count ?? 0}/${selectedTurma.capacity} alunos`
                          : "Capacidade não definida"}
                      </p>
                      {typeof selectedTurma.capacity === "number" &&
                      selectedTurma.capacity > 0 &&
                      (selectedTurma.enrolled_count ?? 0) >= selectedTurma.capacity ? (
                        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                          <strong>Turma cheia:</strong> {selectedTurma.enrolled_count ?? 0} de{" "}
                          {selectedTurma.capacity} lugares ocupados. Escolha outra turma.
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {enrollmentWindow.reasonField && values.turmaId ? (
                    <Textarea
                      aria-label="Motivo da matrícula fora do ciclo"
                      placeholder="Motivo da matrícula fora do ciclo (fica registado)"
                      className="mt-2"
                      value={values.motivoCiclo}
                      onChange={(e) => setField("motivoCiclo", e.target.value)}
                    />
                  ) : null}
                </SheetCell>
              </SheetGrid>
            );
          }
          const isOverCapacity =
            selectedTurma &&
            typeof selectedTurma.capacity === "number" &&
            selectedTurma.capacity > 0 &&
            (selectedTurma.enrolled_count ?? 0) >= selectedTurma.capacity;
          const turmaLabel =
            turmaOptions.find((option) => option.id === values.turmaId)?.label ?? "Sem turma";
          const guardianLabel =
            guardians.find((person) => person.id === values.encarregadoId)?.full_name ?? "—";
          return (
            <div className="grid gap-2 bg-card p-4 text-sm sm:grid-cols-2">
              <p>
                <strong>Aluno:</strong> {values.nome || "—"}
              </p>
              <p>
                <strong>Nº de estudante:</strong> gerado automaticamente ao gravar
              </p>
              <p>
                <strong>Turma:</strong> {turmaLabel}
                {isOverCapacity ? (
                  <span className="ml-1.5 inline-flex items-center rounded-sm border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[11px] font-bold text-destructive">
                    Sobrelotação
                  </span>
                ) : null}
              </p>
              <p>
                <strong>Encarregado:</strong> {guardianLabel}
              </p>
              <p className="sm:col-span-2 text-muted-foreground">
                A secretaria pode completar documentos e relações depois, na ficha do aluno.
              </p>
            </div>
          );
        }}
      </SequentialSheetModal>
      {existing ? (
        <QuickFormModal
          key={existing.key}
          autoOpen
          trigger={() => null}
          eyebrow={existing.student.full_name}
          title="Matricular aluno existente"
          description="Usa a ficha que já existe: não cria outro aluno. Se já tiver matrícula no ano da turma escolhida, muda de turma nessa matrícula."
          icon={<UserPlus className="size-5" />}
          submitLabel="Matricular"
          successDescription="Matrícula gravada na ficha existente."
          fields={[
            {
              name: "turma",
              label: "Turma",
              type: "select",
              full: true,
              options: classGroups.map((group) => ({
                value: group.id,
                label: [formatEnrollmentClassGroupLabel(group), group.academic_year_name]
                  .filter(Boolean)
                  .join(" · "),
              })),
            },
          ]}
          onSubmit={async (submitted) => {
            const turma = classGroups.find((group) => group.id === submitted["turma"]);
            if (!turma) throw new Error("Seleccione uma turma válida.");
            await enrollStudentInClass({
              data: { studentId: existing.student.id, classGroupId: turma.id },
            });
            setValues(emptyValues);
            await onCreated();
          }}
        />
      ) : null}
    </>
  );
}

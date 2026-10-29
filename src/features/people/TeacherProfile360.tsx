import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  GraduationCap,
  History,
  Landmark,
  Mail,
  Phone,
  Users,
  Wallet,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TeacherWorkspacePanel } from "@/features/academic/TeacherWorkspacePanel";
import { TeacherTodayLessonsPanel } from "@/features/hr/TeacherTodayLessonsPanel";
import { TeacherDocumentsPanel } from "@/features/people/TeacherDocumentsPanel";
import { TeacherContextHub } from "@/features/people/TeacherContextHub";
import type { ModuleGrantMap } from "@/features/auth/access-policy";
import { getHrEmployeeDetail } from "@/features/hr/server";
import {
  ABSENCE_TYPE_LABELS,
  competenceLabel,
  contractState,
  employmentTypeLabel,
  payrollState,
  salaryTypeLabel,
  type HrEmployeeDetail,
} from "@/features/hr/employee-detail";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import {
  plannedLessonsToday,
  resolveTeacherLevels,
  teachingLevelLabel,
} from "@/features/people/teacher-profile-context";
import { kwanza } from "@/lib/currency";

type Teacher = {
  id: string;
  person_id?: string | null;
  full_name: string;
  employee_number?: string | null;
  status?: string | null;
  phone?: string | null;
  email?: string | null;
};
type Workspace = {
  classes: Array<{
    id: string;
    name: string;
    grade_name?: string | null;
    course_name?: string | null;
    subject_id?: string | null;
    subject_name: string;
  }>;
  schedule: Array<{
    id: string;
    weekday_label: string;
    starts_at: string;
    ends_at: string;
    subject_name: string;
    class_group_name: string;
  }>;
  enrollments: Array<{ id: string }>;
};
type TabId =
  | "resumo"
  | "hoje"
  | "disciplinas"
  | "avaliacao"
  | "ferramentas"
  | "documentos"
  | "contratos"
  | "vencimentos"
  | "historico";
const tabs: Array<{ id: TabId; label: string; icon: typeof BookOpen; hr?: boolean }> = [
  { id: "resumo", label: "Visão geral", icon: Users },
  { id: "hoje", label: "Aulas de hoje", icon: CalendarDays },
  { id: "disciplinas", label: "Cursos e disciplinas", icon: BookOpen },
  { id: "avaliacao", label: "Avaliação e tarefas", icon: ClipboardCheck },
  { id: "ferramentas", label: "Ferramentas", icon: BookOpen },
  { id: "documentos", label: "Documentos", icon: FileText },
  { id: "contratos", label: "Contrato e cargo", icon: BriefcaseBusiness, hr: true },
  { id: "vencimentos", label: "Salário e pagamentos", icon: Wallet, hr: true },
  { id: "historico", label: "Histórico", icon: History },
];

function EmptyMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{children ?? "—"}</dd>
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function HrState({
  loading,
  error,
  employee,
  children,
}: {
  loading: boolean;
  error: boolean;
  employee: HrEmployeeDetail | null | undefined;
  children: (value: HrEmployeeDetail) => ReactNode;
}) {
  if (loading) return <EmptyMessage>A carregar dados autorizados do RH…</EmptyMessage>;
  if (error)
    return (
      <EmptyMessage>
        Não foi possível consultar o RH. Confirme as permissões e tente novamente.
      </EmptyMessage>
    );
  if (!employee)
    return (
      <EmptyMessage>
        Não existe vínculo laboral registado nesta escola para este professor.
      </EmptyMessage>
    );
  return <>{children(employee)}</>;
}

/**
 * Ficha contextual do professor: reutiliza o motor de contexto global e os
 * módulos pedagógicos/RH. Não cria segunda sidebar nem duplica CRUD/financeiro.
 * O endpoint RH mantém autorização no servidor e só é consultado no separador.
 */
export function TeacherProfile360({
  teacher,
  initialTab = "resumo",
  workspace,
  schoolId,
  schoolName,
  yearLabel,
  configuredLevels,
  selfTeacherId,
  canManage,
  canManageDocuments,
  canReadHr,
  employmentId,
  role,
  grants,
}: {
  teacher: Teacher;
  initialTab?: "resumo" | "documentos";
  workspace: Workspace | undefined;
  schoolId: string | null;
  schoolName: string;
  yearLabel: string;
  configuredLevels: readonly string[];
  selfTeacherId: string | null | undefined;
  canManage: boolean;
  canManageDocuments: boolean;
  canReadHr: boolean;
  employmentId: string | undefined;
  role: string;
  grants: ModuleGrantMap;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const isSelf = Boolean(selfTeacherId && selfTeacherId === teacher.id);
  const classes = workspace?.classes ?? [];
  const schedule = workspace?.schedule ?? [];
  const assignedSubjects = new Set(classes.map((item) => item.subject_id || item.subject_name));
  const levels = useMemo(
    () =>
      resolveTeacherLevels(
        classes.map((item) => item.grade_name || item.name),
        configuredLevels,
      ),
    [workspace, configuredLevels],
  );
  const today = useMemo(() => plannedLessonsToday(schedule), [workspace]);
  const courses = useMemo(() => {
    const groups = new Map<string, typeof classes>();
    for (const item of classes) {
      const course =
        item.course_name && item.course_name !== "—" ? item.course_name : "Curso não definido";
      groups.set(course, [...(groups.get(course) ?? []), item]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt"));
  }, [workspace]);
  const hrVisible = canReadHr && Boolean(employmentId);
  const hrQuery = useQuery({
    queryKey: ["hr", "employee", schoolId, employmentId],
    queryFn: () => getHrEmployeeDetail({ data: { employmentId: employmentId! } }),
    enabled: hrVisible && (tab === "contratos" || tab === "vencimentos" || tab === "historico"),
    retry: false,
  });
  const hr = hrQuery.data ?? null;
  const canUseSuperior =
    levels.assigned.includes("superior") ||
    (levels.assigned.length === 0 && levels.school.length === 1 && levels.school[0] === "superior");

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {schoolName} · {yearLabel}
            </p>
            <h2 className="mt-1 font-display text-lg font-bold">Espaço profissional e académico</h2>
          </div>
          <Badge variant={teacher.status === "active" ? "default" : "secondary"}>
            {teacher.status === "active" ? "Professor activo" : "Professor inactivo"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Níveis de ensino associados">
          {(levels.assigned.length ? levels.assigned : levels.school).map((level) => (
            <Badge key={level} variant="outline">
              {teachingLevelLabel(level)}
            </Badge>
          ))}
          {!levels.assigned.length && levels.school.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              Níveis da escola; não há nível atribuído confirmado.
            </span>
          ) : null}
          {!levels.assigned.length && !levels.school.length ? (
            <span className="text-xs text-muted-foreground">
              Nível de ensino por configurar ou por atribuir.
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { label: "Turmas", value: new Set(classes.map((item) => item.id)).size, icon: Users },
            { label: "Disciplinas", value: assignedSubjects.size, icon: BookOpen },
            { label: "Tempos semanais", value: schedule.length, icon: Clock3 },
            { label: "Aulas previstas hoje", value: today.length, icon: CalendarDays },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-border bg-muted/20 p-3">
              <Icon className="mb-2 size-4 text-muted-foreground" aria-hidden />
              <p className="text-xl font-semibold tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)} className="space-y-4">
        <TabsList
          aria-label="Áreas do perfil do professor"
          className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0"
        >
          {tabs
            .filter((item) => !item.hr || hrVisible)
            .map(({ id, label, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="min-h-10 gap-2 rounded-lg border border-border px-3 py-2 text-xs data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10"
              >
                <Icon className="size-4" aria-hidden /> {label}
              </TabsTrigger>
            ))}
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Identificação profissional">
              <dl className="grid grid-cols-2 gap-4">
                <Fact label="Nome">{teacher.full_name}</Fact>
                <Fact label="N.º de funcionário">{teacher.employee_number}</Fact>
                <Fact label="Correio electrónico">{teacher.email}</Fact>
                <Fact label="Telefone">{teacher.phone}</Fact>
              </dl>
              <p className="text-xs text-muted-foreground">
                A identidade e os dados pessoais completos permanecem no cadastro único de Pessoas.
              </p>
            </Section>
            <Section title="Agenda e acesso rápido">
              {today.length ? (
                <ul className="space-y-2">
                  {today.slice(0, 3).map((slot) => (
                    <li
                      key={slot.id}
                      className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 text-sm"
                    >
                      <span>
                        {slot.subject_name} · {slot.class_group_name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {slot.starts_at}–{slot.ends_at}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyMessage>Sem aulas previstas para hoje no horário carregado.</EmptyMessage>
              )}
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/planos-aula" search={{ professor: teacher.id }}>Planos de aula</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/pedagogica" search={{ tab: "notas" }}>
                    Avaliações
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/pedagogica" search={{ tab: "horarios" }}>
                    Horários
                  </Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Horários previstos não confirmam realização, presenças ou pagamentos.
              </p>
            </Section>
          </div>
          <Section title="Ferramentas contextuais">
            <TeacherContextHub
              compact
              teacherId={teacher.id}
              personId={teacher.person_id}
              assignedLevels={levels.assigned}
              schoolLevels={levels.school}
              isSelf={isSelf}
              canManage={canManage}
              canReadHr={hrVisible}
              role={role}
              grants={grants}
              onSelectTab={setTab}
            />
          </Section>
          <InstalledModuleTools module="pedagogica" />
        </TabsContent>

        <TabsContent value="hoje" className="space-y-4">
          {isSelf ? (
            <TeacherTodayLessonsPanel />
          ) : (
            <Section title="Aulas previstas hoje">
              {today.length ? (
                <ul className="divide-y divide-border">
                  {today.map((slot) => (
                    <li key={slot.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                      <span className="font-medium">
                        {slot.subject_name} · {slot.class_group_name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {slot.starts_at}–{slot.ends_at}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyMessage>Sem tempos previstos hoje. Consulte o horário semanal.</EmptyMessage>
              )}
              <p className="text-xs text-muted-foreground">
                A chamada e a confirmação das aulas pertencem ao próprio professor ou aos gestores
                autorizados na Área Pedagógica.
              </p>
            </Section>
          )}
          {canManage ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/pedagogica" search={{ tab: "presencas", professor: teacher.id }}>
                Consultar presenças deste professor
              </Link>
            </Button>
          ) : null}
        </TabsContent>

        <TabsContent value="disciplinas" className="space-y-4">
          <Section title="Turmas, disciplinas e horário">
            <p className="text-xs text-muted-foreground">
              Atribuições activas da escola seleccionada. A filtragem completa por ano
              lectivo será aplicada quando o serviço de horários a disponibilizar.
            </p>
            {courses.length ? (
              courses.map(([course, items]) => (
                <div key={course} className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {course}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {items.length} atribuições
                    </span>
                  </h3>
                  <ul className="grid gap-2 md:grid-cols-2">
                    {items.map((item) => (
                      <li
                        key={`${item.id}:${item.subject_id ?? item.subject_name}`}
                        className="rounded-lg border border-border p-3"
                      >
                        <p className="text-sm font-semibold">{item.subject_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.grade_name || "Classe por definir"} · {item.name}
                        </p>
                        <Button
                          asChild
                          variant="link"
                          size="sm"
                          className="mt-1 h-auto p-0 text-xs"
                        >
                          <Link
                            to="/pedagogica"
                            search={{
                              tab: "notas",
                              turma: item.id,
                              disciplina: item.subject_id ?? undefined,
                            }}
                          >
                            Abrir disciplina
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <EmptyMessage>
                Ainda não existem disciplinas atribuídas a este professor na escola activa.
              </EmptyMessage>
            )}
          </Section>
          <TeacherWorkspacePanel
            teacherId={teacher.id}
            title="Área lectiva"
            canManage={canManage}
            showInstalledTools={false}
          />
        </TabsContent>

        <TabsContent value="avaliacao" className="space-y-4">
          <Section title="Avaliações, tarefas e plano de aula">
            <p className="text-sm text-muted-foreground">
              Abra os módulos existentes para trabalhar em segurança, com as validações, estados e
              permissões originais.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/pedagogica" search={{ tab: "notas" }}>
                  <GraduationCap className="mr-2 size-4" />
                  Lançamento de notas
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/planos-aula">
                  <FileText className="mr-2 size-4" />
                  Planos de aula
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/pedagogica/trabalhos" search={{ professor: teacher.id }}>
                  <ClipboardCheck className="mr-2 size-4" />
                  Trabalhos
                </Link>
              </Button>
              {canUseSuperior ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/pedagogica/pautas-superior">
                    <Landmark className="mr-2 size-4" />
                    Pautas do Superior
                  </Link>
                </Button>
              ) : null}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="ferramentas" className="space-y-4">
          <Section title="Todos os contextos do professor">
            <TeacherContextHub
              teacherId={teacher.id}
              personId={teacher.person_id}
              assignedLevels={levels.assigned}
              schoolLevels={levels.school}
              isSelf={isSelf}
              canManage={canManage}
              canReadHr={hrVisible}
              role={role}
              grants={grants}
              onSelectTab={setTab}
            />
          </Section>
        </TabsContent>

        <TabsContent value="documentos" className="space-y-4">
          <TeacherDocumentsPanel
            teacherId={teacher.id}
            personId={teacher.person_id}
            schoolId={schoolId}
            canManage={canManageDocuments}
          />
        </TabsContent>

        <TabsContent value="contratos" className="space-y-4">
          {hrVisible ? (
            <HrState loading={hrQuery.isLoading} error={hrQuery.isError} employee={hr}>
              {(employee) => (
                <>
                  <Section title="Cargo e vínculo laboral">
                    <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <Fact label="Cargo">{employee.position}</Fact>
                      <Fact label="Departamento">{employee.department}</Fact>
                      <Fact label="Tipo de vínculo">
                        {employmentTypeLabel(employee.employmentType)}
                      </Fact>
                      <Fact label="Admissão">{employee.hireDate}</Fact>
                      <Fact label="Carga semanal">
                        {employee.weeklyHours == null ? "—" : `${employee.weeklyHours} horas`}
                      </Fact>
                      <Fact label="Local de trabalho">{employee.workLocation}</Fact>
                      <Fact label="Estado">{employee.status}</Fact>
                      <Fact label="Cessação">{employee.terminationDate}</Fact>
                    </dl>
                  </Section>
                  <Section title="Contratos associados">
                    {employee.contracts.length ? (
                      <ul className="divide-y divide-border">
                        {employee.contracts.map((contract) => (
                          <li key={contract.id} className="space-y-2 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong className="text-sm">
                                {contract.number || "Contrato sem número"}
                              </strong>
                              <Badge variant="outline">
                                {contractState(contract.status).label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {contract.type} · {salaryTypeLabel(contract.salaryType)} ·{" "}
                              {contract.startsOn || "—"} a{" "}
                              {contract.endsOn || "sem termo registado"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyMessage>Nenhum contrato registado no módulo de RH.</EmptyMessage>
                    )}
                    <Button asChild variant="outline" size="sm">
                      <Link
                        to="/financeiro/rh/funcionarios/$employmentId"
                        params={{ employmentId: employee.id }}
                      >
                        Abrir ficha completa no RH
                      </Link>
                    </Button>
                  </Section>
                </>
              )}
            </HrState>
          ) : null}
        </TabsContent>

        <TabsContent value="vencimentos" className="space-y-4">
          {hrVisible ? (
            <HrState loading={hrQuery.isLoading} error={hrQuery.isError} employee={hr}>
              {(employee) => (
                <>
                  <Section title="Remuneração contratual">
                    {employee.contracts.length ? (
                      <ul className="divide-y divide-border">
                        {employee.contracts.map((contract) => (
                          <li
                            key={contract.id}
                            className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                          >
                            <div>
                              <p className="font-semibold">{contract.number || "Contrato"}</p>
                              <p className="text-xs text-muted-foreground">
                                {salaryTypeLabel(contract.salaryType)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p>{kwanza(contract.baseSalaryKz)} base</p>
                              {contract.hourlyRateKz != null ? (
                                <p className="text-xs text-muted-foreground">
                                  {kwanza(contract.hourlyRateKz)} / hora
                                </p>
                              ) : null}
                              {contract.lessonHourRateKz != null ? (
                                <p className="text-xs text-muted-foreground">
                                  {kwanza(contract.lessonHourRateKz)} / tempo lectivo
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyMessage>Não existe contrato remuneratório associado.</EmptyMessage>
                    )}
                  </Section>
                  <Section title="Histórico da folha salarial">
                    {employee.payslips.length ? (
                      <ul className="divide-y divide-border">
                        {employee.payslips.map((slip) => (
                          <li
                            key={slip.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                          >
                            <div>
                              <strong>
                                {competenceLabel(slip.competenceYear, slip.competenceMonth)}
                              </strong>
                              <p className="text-xs text-muted-foreground">
                                Bruto {kwanza(slip.grossKz)} · Descontos {kwanza(slip.deductionsKz)}
                              </p>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline">{payrollState(slip.runStatus).label}</Badge>
                              <p className="mt-1 font-semibold tabular-nums">
                                {kwanza(slip.netKz)}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyMessage>
                        Não existem lançamentos de folha salarial para este professor.
                      </EmptyMessage>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Uma folha em rascunho ou aprovada não significa pagamento efectuado. O estado
                      é o registado no RH.
                    </p>
                  </Section>
                </>
              )}
            </HrState>
          ) : null}
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          <Section title="Histórico académico na escola">
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Fact label="Registos de matrícula nas turmas">
                {workspace?.enrollments.length ?? 0}
              </Fact>
              <Fact label="Atribuições de disciplinas">{classes.length}</Fact>
              <Fact label="Tempos do horário actual">{schedule.length}</Fact>
            </dl>
            <p className="text-xs text-muted-foreground">
              Este é o retrato actual das atribuições, não um histórico completo de anos anteriores.
            </p>
          </Section>
          {hrVisible ? (
            <HrState loading={hrQuery.isLoading} error={hrQuery.isError} employee={hr}>
              {(employee) => (
                <Section title="Histórico de ausências registadas no RH">
                  {employee.absences.length ? (
                    <ul className="divide-y divide-border">
                      {employee.absences.map((absence) => (
                        <li
                          key={absence.id}
                          className="flex flex-wrap justify-between gap-3 py-3 text-sm"
                        >
                          <span>
                            {absence.date} · {ABSENCE_TYPE_LABELS[absence.type] ?? absence.type}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {absence.validationStatus}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyMessage>Sem ausências registadas.</EmptyMessage>
                  )}
                </Section>
              )}
            </HrState>
          ) : null}
        </TabsContent>
      </Tabs>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Mail className="size-3.5" aria-hidden /> Contactos e contratos seguem as permissões da
        escola. <Phone className="size-3.5" aria-hidden /> Os dados nunca são partilhados entre
        instituições.
      </p>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Layers, Clock, Plus, Tag, CheckCircle2, Save, Trash2, User } from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listSubjectTypes,
  createSubjectType,
  listCurriculumAreas,
  createCurriculumArea,
  listSchoolShifts,
  saveSchoolShift,
  listCurricula,
  saveCurriculumMatrix,
  listTeacherAvailability,
  saveTeacherAvailability,
} from "@/features/academic/server";
import { toast } from "sonner";
import { EMPTY_LIST } from "@/lib/stable-empty";
import { errorMessage } from "@/lib/error-message";

const availabilityWeekdays = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
] as const;

type CurriculumRow = {
  key: string;
  subjectId: string;
  subjectTypeId: string;
  weeklyPeriods: number;
  periodDurationMinutes: number;
  isMandatory: boolean;
};

type AvailabilityRow = {
  weekday: number;
  isAvailable: boolean;
  startsAt: string;
  endsAt: string;
  notes: string;
};

type CurriculumWithSubjects = {
  id: string;
  course_id: string;
  grade_level_id: string;
  curriculum_subjects?: Array<{
    id?: string;
    subject_id?: string;
    subject_type_id?: string | null;
    weekly_periods?: number;
    period_duration_minutes?: number;
    is_mandatory?: boolean;
  }>;
};

type TeacherAvailabilityRecord = {
  weekday: number;
  is_available?: boolean;
  starts_at?: string;
  ends_at?: string;
  notes?: string | null;
  max_weekly_hours?: number;
};

function defaultAvailabilityRows(): AvailabilityRow[] {
  return availabilityWeekdays.map((_, index) => ({
    weekday: index + 1,
    isAvailable: false,
    startsAt: "07:00",
    endsAt: "17:00",
    notes: "",
  }));
}

export function CurriculoWorkspaceTab({
  canManage,
  activeYearId,
  courses,
  gradeLevels,
  subjects,
  teachers,
}: {
  canManage: boolean;
  activeYearId?: string;
  courses: Array<{ id: string; name: string; code: string }>;
  gradeLevels: Array<{ id: string; name: string; code: string }>;
  subjects: Array<{ id: string; name: string; code: string; subject_type_id?: string | null }>;
  teachers: Array<{ id: string; name: string }>;
}) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<"matriz" | "tipos" | "areas" | "turnos" | "disponibilidade">(
    "matriz",
  );

  const subjectTypesQuery = useQuery({
    queryKey: ["academic", "subject-types"],
    queryFn: () => listSubjectTypes(),
  });
  const subjectTypes = subjectTypesQuery.data ?? EMPTY_LIST;

  const curriculumAreasQuery = useQuery({
    queryKey: ["academic", "curriculum-areas"],
    queryFn: () => listCurriculumAreas(),
  });
  const curriculumAreas = curriculumAreasQuery.data ?? EMPTY_LIST;

  const shiftsQuery = useQuery({
    queryKey: ["academic", "school-shifts"],
    queryFn: () => listSchoolShifts(),
  });
  const shifts = shiftsQuery.data ?? EMPTY_LIST;

  const curriculaQuery = useQuery({
    queryKey: ["academic", "curricula"],
    queryFn: () => listCurricula({ data: {} }),
  });
  const curricula = curriculaQuery.data ?? EMPTY_LIST;

  // --- Matriz Curricular ---------------------------------------------------
  const [matrixCourseId, setMatrixCourseId] = useState("");
  const [matrixGradeLevelId, setMatrixGradeLevelId] = useState("");
  const [matrixRows, setMatrixRows] = useState<CurriculumRow[]>([]);
  const [savingMatrix, setSavingMatrix] = useState(false);

  const selectedCurriculum = useMemo(() => {
    if (!matrixCourseId || !matrixGradeLevelId) return null;
    return (
      (curricula as CurriculumWithSubjects[]).find(
        (c) => c.course_id === matrixCourseId && c.grade_level_id === matrixGradeLevelId,
      ) ?? null
    );
  }, [curricula, matrixCourseId, matrixGradeLevelId]);

  useEffect(() => {
    if (!matrixCourseId || !matrixGradeLevelId) {
      setMatrixRows([]);
      return;
    }
    const existingSubjects = selectedCurriculum?.curriculum_subjects ?? [];
    setMatrixRows(
      existingSubjects.map((row, index) => ({
        key: row.id ?? `existing-${index}`,
        subjectId: row.subject_id ?? "",
        subjectTypeId: row.subject_type_id ?? "",
        weeklyPeriods: row.weekly_periods ?? 4,
        periodDurationMinutes: row.period_duration_minutes ?? 45,
        isMandatory: row.is_mandatory ?? true,
      })),
    );
  }, [selectedCurriculum, matrixCourseId, matrixGradeLevelId]);

  const addMatrixRow = () => {
    const firstSubject = subjects[0];
    setMatrixRows((rows) => [
      ...rows,
      {
        key: `new-${Date.now()}-${rows.length}`,
        subjectId: firstSubject?.id ?? "",
        subjectTypeId: firstSubject?.subject_type_id ?? "",
        weeklyPeriods: 4,
        periodDurationMinutes: 45,
        isMandatory: true,
      },
    ]);
  };

  const updateMatrixRow = (key: string, patch: Partial<CurriculumRow>) => {
    setMatrixRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeMatrixRow = (key: string) => {
    setMatrixRows((rows) => rows.filter((row) => row.key !== key));
  };

  const handleSaveMatrix = async () => {
    if (!activeYearId || !matrixCourseId || !matrixGradeLevelId || matrixRows.length === 0) return;
    const course = courses.find((c) => c.id === matrixCourseId);
    const gradeLevel = gradeLevels.find((g) => g.id === matrixGradeLevelId);
    setSavingMatrix(true);
    try {
      await saveCurriculumMatrix({
        data: {
          academicYearId: activeYearId,
          courseId: matrixCourseId,
          gradeLevelId: matrixGradeLevelId,
          name: `${course?.name ?? "Curso"} — ${gradeLevel?.name ?? "Classe"}`,
          subjects: matrixRows.map((row, index) => ({
            subjectId: row.subjectId,
            subjectTypeId: row.subjectTypeId || undefined,
            weeklyPeriods: row.weeklyPeriods,
            periodDurationMinutes: row.periodDurationMinutes,
            isMandatory: row.isMandatory,
            displayOrder: index,
          })),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["academic", "curricula"] });
      toast.success("Matriz curricular guardada com sucesso.");
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao guardar a matriz curricular."));
    } finally {
      setSavingMatrix(false);
    }
  };

  // --- Disponibilidade Docente ----------------------------------------------
  const [availabilityTeacherId, setAvailabilityTeacherId] = useState("");
  const [availabilityRows, setAvailabilityRows] =
    useState<AvailabilityRow[]>(defaultAvailabilityRows());
  const [maxWeeklyHours, setMaxWeeklyHours] = useState(24);
  const [savingAvailability, setSavingAvailability] = useState(false);

  const teacherAvailabilityQuery = useQuery({
    queryKey: ["academic", "teacher-availability", availabilityTeacherId, activeYearId],
    queryFn: () =>
      listTeacherAvailability({
        data: { teacherId: availabilityTeacherId, academicYearId: activeYearId },
      }),
    enabled: Boolean(availabilityTeacherId),
  });
  const teacherAvailability = teacherAvailabilityQuery.data ?? EMPTY_LIST;

  useEffect(() => {
    if (!availabilityTeacherId) {
      setAvailabilityRows(defaultAvailabilityRows());
      return;
    }
    const availabilityRecords = teacherAvailability as TeacherAvailabilityRecord[];
    const byWeekday = new Map(availabilityRecords.map((row) => [row.weekday, row]));
    setAvailabilityRows(
      availabilityWeekdays.map((_, index) => {
        const weekday = index + 1;
        const existing = byWeekday.get(weekday);
        if (!existing) {
          return { weekday, isAvailable: false, startsAt: "07:00", endsAt: "17:00", notes: "" };
        }
        return {
          weekday,
          isAvailable: existing.is_available ?? true,
          startsAt: String(existing.starts_at ?? "07:00").slice(0, 5),
          endsAt: String(existing.ends_at ?? "17:00").slice(0, 5),
          notes: existing.notes ?? "",
        };
      }),
    );
    if (availabilityRecords[0]?.max_weekly_hours) {
      setMaxWeeklyHours(availabilityRecords[0].max_weekly_hours);
    }
  }, [teacherAvailability, availabilityTeacherId]);

  const updateAvailabilityRow = (weekday: number, patch: Partial<AvailabilityRow>) => {
    setAvailabilityRows((rows) =>
      rows.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)),
    );
  };

  const handleSaveAvailability = async () => {
    if (!availabilityTeacherId) return;
    setSavingAvailability(true);
    try {
      await saveTeacherAvailability({
        data: {
          teacherId: availabilityTeacherId,
          academicYearId: activeYearId,
          maxWeeklyHours,
          slots: availabilityRows.map((row) => ({
            weekday: row.weekday,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            isAvailable: row.isAvailable,
            notes: row.notes.trim() || undefined,
          })),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: ["academic", "teacher-availability", availabilityTeacherId],
      });
      toast.success("Disponibilidade guardada com sucesso.");
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao guardar a disponibilidade."));
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleCreateSubjectType = async (values: Record<string, string | undefined>) => {
    try {
      await createSubjectType({
        data: {
          code: values["codigo"]?.trim() || "",
          name: values["nome"]?.trim() || "",
          description: values["descricao"]?.trim() || undefined,
          countsForGpa: values["contaMedia"] !== "false",
          appearsInPauta: values["aparecePauta"] !== "false",
          hasExam: values["temExame"] === "true",
          canFail: values["podeReprovar"] !== "false",
          isMandatory: values["obrigatoria"] !== "false",
          defaultWeight: Number(values["peso"] || 1),
          requiresSpecialRoom: values["salaEspecial"] === "true",
          color: values["cor"]?.trim() || "#3b82f6",
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["academic", "subject-types"] });
      toast.success("Tipo de disciplina criado com sucesso.");
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao criar tipo de disciplina."));
    }
  };

  const handleCreateArea = async (values: Record<string, string | undefined>) => {
    try {
      await createCurriculumArea({
        data: {
          code: values["codigo"]?.trim() || "",
          name: values["nome"]?.trim() || "",
          description: values["descricao"]?.trim() || undefined,
          color: values["cor"]?.trim() || "#6366f1",
          displayOrder: Number(values["ordem"] || 1),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["academic", "curriculum-areas"] });
      toast.success("Área curricular criada com sucesso.");
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao criar área curricular."));
    }
  };

  const handleSaveShift = async (values: Record<string, string | undefined>) => {
    try {
      await saveSchoolShift({
        data: {
          code: values["codigo"]?.trim() || "",
          name: values["nome"]?.trim() || "",
          startsAt: values["inicio"]?.trim() || "07:00",
          endsAt: values["fim"]?.trim() || "12:30",
          defaultLessonDuration: Number(values["duracao"] || 45),
          defaultBreakDuration: Number(values["intervalo"] || 15),
          activeDays: [1, 2, 3, 4, 5],
          color: values["cor"]?.trim() || "#3b82f6",
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["academic", "school-shifts"] });
      toast.success("Turno salvo com sucesso.");
    } catch (err) {
      toast.error(errorMessage(err, "Erro ao salvar turno."));
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navegação do Currículo */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Button
          variant={subTab === "matriz" ? "default" : "outline"}
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => setSubTab("matriz")}
        >
          <BookOpen className="mr-1.5 size-3.5" /> Matrizes Curriculares
        </Button>

        <Button
          variant={subTab === "tipos" ? "default" : "outline"}
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => setSubTab("tipos")}
        >
          <Tag className="mr-1.5 size-3.5" /> Tipos de Disciplinas ({subjectTypes.length})
        </Button>

        <Button
          variant={subTab === "areas" ? "default" : "outline"}
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => setSubTab("areas")}
        >
          <Layers className="mr-1.5 size-3.5" /> Áreas Curriculares ({curriculumAreas.length})
        </Button>

        <Button
          variant={subTab === "turnos" ? "default" : "outline"}
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => setSubTab("turnos")}
        >
          <Clock className="mr-1.5 size-3.5" /> Turnos & Períodos ({shifts.length})
        </Button>

        <Button
          variant={subTab === "disponibilidade" ? "default" : "outline"}
          size="sm"
          className="rounded-xl text-xs"
          onClick={() => setSubTab("disponibilidade")}
        >
          <User className="mr-1.5 size-3.5" /> Disponibilidade Docente
        </Button>
      </div>

      {/* 1. ABA MATRIZ CURRICULAR */}
      {subTab === "matriz" && (
        <Panel
          title="Matrizes Curriculares da Instituição"
          description="A matriz curricular define a carga horária, aulas semanais e obrigatoriedade das disciplinas para cada Curso e Classe."
        >
          {!canManage ? (
            <p className="text-sm text-muted-foreground">
              A gestão da matriz curricular está reservada a Secretaria/Admin.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <select
                  aria-label="Curso da matriz curricular"
                  value={matrixCourseId}
                  onChange={(e) => setMatrixCourseId(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
                >
                  <option value="">Seleccione o Curso…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Classe da matriz curricular"
                  value={matrixGradeLevelId}
                  onChange={(e) => setMatrixGradeLevelId(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
                >
                  <option value="">Seleccione a Classe…</option>
                  {gradeLevels.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </div>

              {!matrixCourseId || !matrixGradeLevelId ? (
                <p className="text-sm text-muted-foreground">
                  Escolha um Curso e uma Classe para ver ou construir a matriz curricular.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs font-semibold">Disciplina</TableHead>
                          <TableHead className="text-xs font-semibold">Tipo</TableHead>
                          <TableHead className="text-xs font-semibold text-center">
                            Aulas/Semana
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-center">
                            Duração (min)
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-center">
                            Obrigatória
                          </TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matrixRows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="py-6 text-center text-xs text-muted-foreground"
                            >
                              Sem disciplinas na matriz. Adicione a primeira abaixo.
                            </TableCell>
                          </TableRow>
                        ) : (
                          matrixRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell>
                                <select
                                  aria-label="Disciplina da linha"
                                  value={row.subjectId}
                                  onChange={(e) =>
                                    updateMatrixRow(row.key, { subjectId: e.target.value })
                                  }
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                >
                                  {subjects.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name} ({s.code})
                                    </option>
                                  ))}
                                </select>
                              </TableCell>
                              <TableCell>
                                <select
                                  aria-label="Tipo de disciplina"
                                  value={row.subjectTypeId}
                                  onChange={(e) =>
                                    updateMatrixRow(row.key, { subjectTypeId: e.target.value })
                                  }
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                >
                                  <option value="">Padrão</option>
                                  {(subjectTypes as Array<{ id: string; name: string }>).map(
                                    (t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </TableCell>
                              <TableCell className="text-center">
                                <input
                                  aria-label="Tempos semanais"
                                  type="number"
                                  min={1}
                                  max={25}
                                  value={row.weeklyPeriods}
                                  onChange={(e) =>
                                    updateMatrixRow(row.key, {
                                      weeklyPeriods: Number(e.target.value) || 1,
                                    })
                                  }
                                  className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs text-center"
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <input
                                  aria-label="Duração do tempo, em minutos"
                                  type="number"
                                  min={15}
                                  max={180}
                                  step={5}
                                  value={row.periodDurationMinutes}
                                  onChange={(e) =>
                                    updateMatrixRow(row.key, {
                                      periodDurationMinutes: Number(e.target.value) || 45,
                                    })
                                  }
                                  className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs text-center"
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <input
                                  aria-label="Disciplina obrigatória"
                                  type="checkbox"
                                  checked={row.isMandatory}
                                  onChange={(e) =>
                                    updateMatrixRow(row.key, { isMandatory: e.target.checked })
                                  }
                                  className="size-4"
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-7 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeMatrixRow(row.key)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={addMatrixRow}>
                      <Plus className="size-3.5" /> Adicionar Disciplina
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={!activeYearId || matrixRows.length === 0 || savingMatrix}
                      onClick={handleSaveMatrix}
                    >
                      <Save className="size-3.5" />
                      {savingMatrix ? "A guardar…" : "Guardar Matriz"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* 2. ABA TIPOS DE DISCIPLINAS */}
      {subTab === "tipos" && (
        <Panel
          title="Tipos de Disciplinas"
          description="Classificação institucional com impacto em médias, pautas, salas especiais e exames."
          action={
            canManage && (
              <QuickFormModal
                title="Novo Tipo de Disciplina"
                eyebrow="Currículo"
                description="Cadastre uma classificação pedagógica (ex: Formação Geral, Formação Específica, Laboratorial)."
                icon={<Plus className="size-5" />}
                submitLabel="Criar Tipo"
                onSubmit={handleCreateSubjectType}
                fields={[
                  { name: "codigo", label: "Código", placeholder: "Ex: tecnica", required: true },
                  {
                    name: "nome",
                    label: "Nome do Tipo",
                    placeholder: "Ex: Formação Técnica",
                    required: true,
                  },
                  {
                    name: "peso",
                    label: "Peso Padrão na Média",
                    type: "number",
                    defaultValue: "1.0",
                    required: true,
                  },
                  {
                    name: "descricao",
                    label: "Descrição",
                    placeholder: "Finalidade formativa deste tipo",
                    required: false,
                  },
                  {
                    name: "cor",
                    label: "Cor Visual (Hex)",
                    placeholder: "#3b82f6",
                    defaultValue: "#3b82f6",
                  },
                ]}
                trigger={(open) => (
                  <Button size="sm" className="gap-1.5" onClick={open}>
                    <Plus className="size-3.5" /> Novo Tipo
                  </Button>
                )}
              />
            )
          }
        >
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs font-semibold">Código</TableHead>
                  <TableHead className="text-xs font-semibold">Designação</TableHead>
                  <TableHead className="text-xs font-semibold text-center">
                    Conta p/ Média
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-center">Pauta Oficial</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Tem Exame</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Peso</TableHead>
                  <TableHead className="text-xs font-semibold">Exige Sala Especial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjectTypes.map((type) => (
                  <TableRow key={type.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-bold text-foreground">
                      {type.code}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-xs text-foreground flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: type.color || "#3b82f6" }}
                        />
                        {type.name}
                      </span>
                      {type.description && (
                        <p className="text-[11px] text-muted-foreground">{type.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {type.counts_for_gpa ? "Sim" : "Não"}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {type.appears_in_pauta ? "Sim" : "Não"}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {type.has_exam ? "Sim" : "Não"}
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs font-bold">
                      {type.default_weight}x
                    </TableCell>
                    <TableCell className="text-xs">
                      {type.requires_special_room ? "Sim (Laboratório/Oficina)" : "Não"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}

      {/* 3. ABA ÁREAS CURRICULARES */}
      {subTab === "areas" && (
        <Panel
          title="Áreas Curriculares"
          description="Agrupamento disciplinar para comparação de desempenho, relatórios e equilíbrio pedagógico."
          action={
            canManage && (
              <QuickFormModal
                title="Nova Área Curricular"
                eyebrow="Currículo"
                description="Cadastre um agrupamento (ex: Ciências Exatas, Línguas e Comunicação)."
                icon={<Plus className="size-5" />}
                submitLabel="Criar Área"
                onSubmit={handleCreateArea}
                fields={[
                  { name: "codigo", label: "Código", placeholder: "Ex: exatas", required: true },
                  {
                    name: "nome",
                    label: "Nome da Área",
                    placeholder: "Ex: Ciências Exatas",
                    required: true,
                  },
                  {
                    name: "ordem",
                    label: "Ordem de Apresentação",
                    type: "number",
                    defaultValue: "1",
                  },
                  {
                    name: "descricao",
                    label: "Descrição",
                    placeholder: "Disciplinas abrangidas",
                    required: false,
                  },
                  { name: "cor", label: "Cor Visual (Hex)", defaultValue: "#2563eb" },
                ]}
                trigger={(open) => (
                  <Button size="sm" className="gap-1.5" onClick={open}>
                    <Plus className="size-3.5" /> Nova Área
                  </Button>
                )}
              />
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {curriculumAreas.map((area) => (
              <div
                key={area.id}
                className="rounded-xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: area.color || "#6366f1" }}
                  />
                  <h5 className="text-xs font-bold text-foreground">{area.name}</h5>
                </div>
                {area.description && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{area.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground font-mono">
                  <span>Código: {area.code}</span>
                  <span>Ordem: #{area.display_order}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 4. ABA TURNOS ESCOLARES */}
      {subTab === "turnos" && (
        <Panel
          title="Turnos & Horários Institucionais"
          description="Defina os turnos escolares e seus limites de início e fim. O motor de horários bloqueia aulas fora destes limites."
          action={
            canManage && (
              <QuickFormModal
                title="Novo Turno Escolar"
                eyebrow="Turnos"
                description="Configure um turno (Manhã, Tarde, Noite, Integral, Pós-Laboral, etc.)."
                icon={<Plus className="size-5" />}
                submitLabel="Salvar Turno"
                onSubmit={handleSaveShift}
                fields={[
                  {
                    name: "codigo",
                    label: "Identificador (Código)",
                    placeholder: "Ex: morning",
                    required: true,
                  },
                  {
                    name: "nome",
                    label: "Nome do Turno",
                    placeholder: "Ex: Manhã (Regular)",
                    required: true,
                  },
                  {
                    name: "inicio",
                    label: "Hora Inicial",
                    type: "time",
                    defaultValue: "07:00",
                    required: true,
                  },
                  {
                    name: "fim",
                    label: "Hora Final",
                    type: "time",
                    defaultValue: "12:30",
                    required: true,
                  },
                  {
                    name: "duracao",
                    label: "Duração Padrão por Bloco (min)",
                    type: "number",
                    defaultValue: "45",
                  },
                  {
                    name: "intervalo",
                    label: "Duração do Recreio/Intervalo (min)",
                    type: "number",
                    defaultValue: "15",
                  },
                ]}
                trigger={(open) => (
                  <Button size="sm" className="gap-1.5" onClick={open}>
                    <Plus className="size-3.5" /> Novo Turno
                  </Button>
                )}
              />
            )
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {shifts.map((shift) => (
              <div
                key={shift.id}
                className="rounded-xl border border-border bg-card p-5 shadow-soft"
              >
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-bold text-foreground">{shift.name}</h5>
                  <span className="font-mono text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                    {shift.starts_at?.slice(0, 5)} – {shift.ends_at?.slice(0, 5)}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <p>• Duração da aula: {shift.default_lesson_duration || 45} minutos</p>
                  <p>• Recreio padrão: {shift.default_break_duration || 15} minutos</p>
                  <p>
                    • Código institucional: <span className="font-mono">{shift.code}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 5. ABA DISPONIBILIDADE DOCENTE */}
      {subTab === "disponibilidade" && (
        <Panel
          title="Disponibilidade Docente"
          description="Defina os dias e horários em que cada professor está disponível para leccionar. O motor de conflitos usa esta informação ao validar novos slots."
        >
          {!canManage ? (
            <p className="text-sm text-muted-foreground">
              A gestão de disponibilidade docente está reservada a Secretaria/Admin.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  aria-label="Professor"
                  value={availabilityTeacherId}
                  onChange={(e) => setAvailabilityTeacherId(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-xs"
                >
                  <option value="">Seleccione o Professor…</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                {availabilityTeacherId && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Carga horária semanal máxima
                    <input
                      aria-label="Máximo de horas semanais"
                      type="number"
                      min={1}
                      max={60}
                      value={maxWeeklyHours}
                      onChange={(e) => setMaxWeeklyHours(Number(e.target.value) || 24)}
                      className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs text-center"
                    />
                    horas
                  </label>
                )}
              </div>

              {!availabilityTeacherId ? (
                <p className="text-sm text-muted-foreground">
                  Escolha um professor para ver ou editar a disponibilidade semanal.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs font-semibold">Dia</TableHead>
                          <TableHead className="text-xs font-semibold text-center">
                            Disponível
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-center">
                            Início
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-center">Fim</TableHead>
                          <TableHead className="text-xs font-semibold">Observações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availabilityRows.map((row, index) => (
                          <TableRow key={row.weekday}>
                            <TableCell className="text-xs font-medium">
                              {availabilityWeekdays[index]}
                            </TableCell>
                            <TableCell className="text-center">
                              <input
                                aria-label="Dia disponível"
                                type="checkbox"
                                checked={row.isAvailable}
                                onChange={(e) =>
                                  updateAvailabilityRow(row.weekday, {
                                    isAvailable: e.target.checked,
                                  })
                                }
                                className="size-4"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <input
                                aria-label="Hora de início"
                                type="time"
                                value={row.startsAt}
                                disabled={!row.isAvailable}
                                onChange={(e) =>
                                  updateAvailabilityRow(row.weekday, { startsAt: e.target.value })
                                }
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <input
                                aria-label="Hora de fim"
                                type="time"
                                value={row.endsAt}
                                disabled={!row.isAvailable}
                                onChange={(e) =>
                                  updateAvailabilityRow(row.weekday, { endsAt: e.target.value })
                                }
                                className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
                              />
                            </TableCell>
                            <TableCell>
                              <input
                                aria-label="Observação de disponibilidade"
                                type="text"
                                value={row.notes}
                                disabled={!row.isAvailable}
                                placeholder="Ex: só disponível quinzenalmente"
                                onChange={(e) =>
                                  updateAvailabilityRow(row.weekday, { notes: e.target.value })
                                }
                                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={savingAvailability}
                      onClick={handleSaveAvailability}
                    >
                      <Save className="size-3.5" />
                      {savingAvailability ? "A guardar…" : "Guardar Disponibilidade"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

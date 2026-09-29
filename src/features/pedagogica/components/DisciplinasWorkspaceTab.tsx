import { GraduationCap, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createSubject,
  updateSubject,
  deactivateSubject,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import { angolaCoreSubjects, angolaTeachingLevels } from "@/lib/angola-academic";
import { cn } from "@/lib/utils";
import { AssignTeacherForm } from "./AssignTeacherForm";

export function DisciplinasWorkspaceTab({
  canManageAcademic,
  subjectsAvailable,
  subjects,
  workspace,
  teacherOptions,
  turmaAssignOptions,
  subjectOptions,
  classGroups,
  teachers,
  teacherNameById,
  teachingLevels,
  classroomOn,
  moodleOn,
  canvasOn,
  subjectTypes = [],
  curriculumAreas = [],
  onRefresh,
}: {
  canManageAcademic: boolean;
  subjectsAvailable: boolean;
  subjects: Array<{
    id: string;
    code?: string | null;
    name: string;
    teacher_name?: string | null;
    classes_label?: string | null;
    weekly_hours?: number | null;
    weekly_hours_label?: string | null;
    approval_rate?: number | null;
    subject_type_id?: string | null;
    curriculum_area_id?: string | null;
    is_mandatory?: boolean;
    is_practical?: boolean;
    annual_hours?: number | null;
    color?: string | null;
  }>;
  workspace?: PedagogicalWorkspace;
  teacherOptions: string[];
  turmaAssignOptions: string[];
  subjectOptions: string[];
  classGroups: Array<{ id: string }>;
  teachers: Array<{ id: string; full_name?: string }>;
  teacherNameById: Map<string, string>;
  teachingLevels: string[];
  classroomOn: boolean;
  moodleOn: boolean;
  canvasOn?: boolean;
  subjectTypes?: Array<{ id: string; name: string; code: string; color?: string | null }>;
  curriculumAreas?: Array<{ id: string; name: string; code: string; color?: string | null }>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <Panel
      title="Disciplinas e docentes"
      description={
        !subjectsAvailable
          ? "Aplique a migração subjects/term_grades para activar este painel"
          : "Catálogo da escola com taxa de aprovação calculada das notas lançadas"
      }
      action={
        canManageAcademic && subjectsAvailable ? (
          <div className="flex flex-wrap gap-2">
            {teacherOptions.length > 0 && turmaAssignOptions.length > 0 ? (
              <AssignTeacherForm
                turmaOptions={turmaAssignOptions}
                subjectOptions={subjectOptions}
                teacherOptions={teacherOptions}
                turmaIds={classGroups.map((group) => group.id)}
                subjectIds={subjects.map((subject) => subject.id)}
                teacherIds={teachers.map((teacher) => teacher.id)}
                classSubjectLinks={(workspace?.classSubjects ?? []).map((row) => ({
                  class_group_id: row.class_group_id,
                  subject_id: row.subject_id,
                }))}
                triggerLabel="Atribuir professor"
                onAssigned={onRefresh}
              />
            ) : null}
            <QuickFormModal
              title="Nova disciplina"
              eyebrow="Pedagógica"
              description="Adicione uma disciplina ao catálogo da escola com tipo e área curricular."
              icon={<Plus className="size-5" />}
              submitLabel="Criar disciplina"
              onSubmit={async (values) => {
                const weeklyHours = Number(values["carga"] || 4);
                const gradeFrom = values["classeDe"] ? Number(values["classeDe"]) : undefined;
                const gradeTo = values["classeAte"] ? Number(values["classeAte"]) : undefined;
                await createSubject({
                  data: {
                    code: values["codigo"] ?? "",
                    name: values["nome"] ?? "",
                    teacherName: values["professor"] || undefined,
                    weeklyHours: Number.isFinite(weeklyHours) ? weeklyHours : 4,
                    gradeFrom: Number.isFinite(gradeFrom) ? gradeFrom : undefined,
                    gradeTo: Number.isFinite(gradeTo) ? gradeTo : undefined,
                    subjectTypeId:
                      values["tipo"] && values["tipo"] !== "none" ? values["tipo"] : undefined,
                    curriculumAreaId:
                      values["area"] && values["area"] !== "none" ? values["area"] : undefined,
                  },
                });
                await onRefresh();
              }}
              fields={[
                {
                  name: "nome",
                  label: "Disciplina",
                  placeholder: "Ex.: Química Geral",
                  full: true,
                },
                { name: "codigo", label: "Código", placeholder: "Ex.: QUI" },
                {
                  name: "tipo",
                  label: "Tipo de disciplina",
                  type: "select",
                  options: [
                    { value: "none", label: "Padrão / Geral" },
                    ...subjectTypes.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` })),
                  ],
                },
                {
                  name: "area",
                  label: "Área de conhecimento",
                  type: "select",
                  options: [
                    { value: "none", label: "Sem área específica" },
                    ...curriculumAreas.map((a) => ({ value: a.id, label: a.name })),
                  ],
                },
                {
                  name: "professor",
                  label: "Docente padrão",
                  placeholder: "Ex.: Prof.ª Ana Silva",
                  required: false,
                },
                {
                  name: "carga",
                  label: "Horas/semana",
                  type: "number",
                  placeholder: "4",
                },
                {
                  name: "classeDe",
                  label: "Classe inicial",
                  type: "number",
                  placeholder: "7",
                  required: false,
                },
                {
                  name: "classeAte",
                  label: "Classe final",
                  type: "number",
                  placeholder: "13",
                  required: false,
                },
              ]}
              trigger={(open) => (
                <Button size="sm" className="gap-1.5" onClick={open}>
                  <Plus className="size-3.5" /> Nova
                </Button>
              )}
            />
          </div>
        ) : null
      }
    >
      {subjectsAvailable && subjects.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-4">
          <div className="rounded-xl border bg-card p-3 shadow-2xs">
            <span className="text-xs text-muted-foreground">Total Catálogo</span>
            <p className="text-xl font-black text-foreground">{subjects.length}</p>
          </div>
          <div className="rounded-xl border bg-card p-3 shadow-2xs">
            <span className="text-xs text-muted-foreground">Obrigatórias</span>
            <p className="text-xl font-black text-primary">
              {subjects.filter((s) => s.is_mandatory !== false).length}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-3 shadow-2xs">
            <span className="text-xs text-muted-foreground">Práticas / Lab</span>
            <p className="text-xl font-black text-success">
              {subjects.filter((s) => s.is_practical).length}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-3 shadow-2xs">
            <span className="text-xs text-muted-foreground">Carga Média</span>
            <p className="text-xl font-black text-foreground">
              {(() => {
                // Só as disciplinas já atribuídas a turmas têm carga (tempos lectivos por
                // semana, de `class_subjects`); antes lia os dígitos da etiqueta e contava
                // 4 para as que não tinham nenhuma.
                const loads = subjects
                  .map((s) => Number(s.weekly_hours ?? 0))
                  .filter((value) => value > 0);
                return loads.length
                  ? Math.round(loads.reduce((acc, value) => acc + value, 0) / loads.length)
                  : "—";
              })()}{" "}
              tempos/sem
            </p>
          </div>
        </div>
      )}
      {!canManageAcademic ? (
        <p className="text-sm text-muted-foreground">
          A consulta de disciplinas reais está reservada a Secretaria/Admin.
        </p>
      ) : !subjectsAvailable ? (
        <p className="text-sm text-muted-foreground">
          Execute <code className="font-mono">supabase db push</code> para criar{" "}
          <code className="font-mono">subjects</code>.
        </p>
      ) : subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há disciplinas. Crie a primeira no botão Nova ou use Configurações → Pedagógico.
        </p>
      ) : (
        <div className="space-y-6">
          {angolaTeachingLevels
            .filter((level) => teachingLevels.length === 0 || teachingLevels.includes(level.id))
            .map((level) => {
              const catalogCodes = new Set(
                angolaCoreSubjects
                  .filter((subject) => subject.levels.includes(level.id))
                  .map((subject) => subject.code),
              );
              const rows = subjects.filter((subject) => {
                const code = String(subject.code ?? "").toUpperCase();
                const catalog = angolaCoreSubjects.find(
                  (item) =>
                    item.code === code ||
                    item.name.toLowerCase() === String(subject.name).toLowerCase(),
                );
                return catalog ? catalog.levels.includes(level.id) : catalogCodes.size === 0;
              });
              if (rows.length === 0) return null;
              return (
                <div key={level.id} className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground">
                    {level.cycle} · {level.classes.join(" · ")}
                  </h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Disciplina</TableHead>
                          <TableHead>Professor</TableHead>
                          <TableHead>Classes</TableHead>
                          <TableHead>Carga horária</TableHead>
                          <TableHead className="text-right">Aprovação</TableHead>
                          <TableHead className="text-right">Acções</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-semibold">
                              <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-2">
                                  <GraduationCap className="size-4 text-primary" />
                                  {d.name}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5 pl-6 text-[11px]">
                                  {(() => {
                                    const typeObj = subjectTypes.find(
                                      (t) => t.id === d.subject_type_id,
                                    );
                                    const areaObj = curriculumAreas.find(
                                      (a) => a.id === d.curriculum_area_id,
                                    );
                                    return (
                                      <>
                                        {typeObj ? (
                                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                                            {typeObj.name}
                                          </span>
                                        ) : null}
                                        {areaObj ? (
                                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                                            {areaObj.name}
                                          </span>
                                        ) : null}
                                        {d.is_practical ? (
                                          <span className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-success">
                                            Prática
                                          </span>
                                        ) : null}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {(() => {
                                const names = (workspace?.classSubjects ?? [])
                                  .filter((row) => row.subject_id === d.id && row.teacher_id)
                                  .map(
                                    (row) =>
                                      teacherNameById.get(row.teacher_id!) ?? row.subject_name,
                                  );
                                return names.length
                                  ? [...new Set(names)].join(" · ")
                                  : (d.teacher_name ?? "—");
                              })()}
                            </TableCell>
                            <TableCell>{d.classes_label}</TableCell>
                            <TableCell>{d.weekly_hours_label}</TableCell>
                            <TableCell className="text-right">
                              {d.approval_rate == null ? (
                                <span className="text-sm text-muted-foreground">Sem notas</span>
                              ) : (
                                <span
                                  className={cn(
                                    badgeBase,
                                    d.approval_rate >= 85
                                      ? toneClass.success
                                      : d.approval_rate >= 75
                                        ? toneClass.warning
                                        : toneClass.danger,
                                  )}
                                >
                                  {d.approval_rate}%
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex justify-end gap-1">
                                <QuickFormModal
                                  title="Editar disciplina"
                                  description="Actualiza o nome e o código no catálogo da escola."
                                  icon={<Pencil className="size-5" />}
                                  submitLabel="Guardar"
                                  successDescription="Disciplina actualizada."
                                  onSubmit={async (values) => {
                                    await updateSubject({
                                      data: {
                                        subjectId: d.id,
                                        name: values["nome"] ?? "",
                                        code: values["codigo"] ?? "",
                                        subjectTypeId:
                                          values["tipo"] && values["tipo"] !== "none"
                                            ? values["tipo"]
                                            : null,
                                        curriculumAreaId:
                                          values["area"] && values["area"] !== "none"
                                            ? values["area"]
                                            : null,
                                      },
                                    });
                                    await onRefresh();
                                  }}
                                  fields={[
                                    {
                                      name: "nome",
                                      label: "Disciplina",
                                      defaultValue: String(d.name ?? ""),
                                      full: true,
                                    },
                                    {
                                      name: "codigo",
                                      label: "Código",
                                      defaultValue: String(d.code ?? ""),
                                    },
                                    {
                                      name: "tipo",
                                      label: "Tipo de disciplina",
                                      type: "select",
                                      defaultValue: d.subject_type_id || "none",
                                      options: [
                                        { value: "none", label: "Padrão / Geral" },
                                        ...subjectTypes.map((t) => ({
                                          value: t.id,
                                          label: `${t.name} (${t.code})`,
                                        })),
                                      ],
                                    },
                                    {
                                      name: "area",
                                      label: "Área de conhecimento",
                                      type: "select",
                                      defaultValue: d.curriculum_area_id || "none",
                                      options: [
                                        { value: "none", label: "Sem área específica" },
                                        ...curriculumAreas.map((a) => ({
                                          value: a.id,
                                          label: a.name,
                                        })),
                                      ],
                                    },
                                  ]}
                                  trigger={(open) => (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="gap-1.5"
                                      onClick={open}
                                    >
                                      <Pencil className="size-3.5" /> Editar
                                    </Button>
                                  )}
                                />
                                {classroomOn ? (
                                  <Button size="sm" variant="ghost" asChild>
                                    <a
                                      href="https://classroom.google.com/"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Classroom
                                    </a>
                                  </Button>
                                ) : null}
                                {moodleOn ? (
                                  <Button size="sm" variant="ghost" asChild>
                                    <a
                                      href="https://docs.moodle.org/en/Web_services"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Moodle
                                    </a>
                                  </Button>
                                ) : null}
                                {canvasOn ? (
                                  <Button size="sm" variant="ghost" asChild>
                                    <a
                                      href="https://www.instructure.com/canvas"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Canvas
                                    </a>
                                  </Button>
                                ) : null}
                                <ConfirmActionModal
                                  title="Desactivar disciplina"
                                  description={`${d.name} sai do catálogo. Turmas ainda ligadas impedem a operação.`}
                                  confirmLabel="Desactivar"
                                  onConfirm={async () => {
                                    await deactivateSubject({
                                      data: { subjectId: d.id },
                                    });
                                    await onRefresh();
                                  }}
                                  trigger={(open) => (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="gap-1.5 text-destructive"
                                      onClick={open}
                                    >
                                      <Trash2 className="size-3.5" /> Desactivar
                                    </Button>
                                  )}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          {subjects.filter((subject) => {
            const code = String(subject.code ?? "").toUpperCase();
            return !angolaCoreSubjects.some(
              (item) =>
                item.code === code ||
                item.name.toLowerCase() === String(subject.name).toLowerCase(),
            );
          }).length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-muted-foreground">Outras disciplinas</h4>
              <p className="text-xs text-muted-foreground">
                {subjects
                  .filter((subject) => {
                    const code = String(subject.code ?? "").toUpperCase();
                    return !angolaCoreSubjects.some(
                      (item) =>
                        item.code === code ||
                        item.name.toLowerCase() === String(subject.name).toLowerCase(),
                    );
                  })
                  .map((subject) => subject.name)
                  .join(" · ")}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

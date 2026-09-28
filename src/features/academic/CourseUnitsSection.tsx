import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookOpen, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelCourseUnitEnrollment,
  enrollCourseUnits,
  getStudentCourseUnits,
  recordCourseUnitGrades,
  type CourseUnitRow,
  type StudentCourseUnits,
} from "./course-units-server";
import { COURSE_UNIT_STATUS_LABELS } from "./course-units";
import { cn } from "@/lib/utils";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível concluir.";

/**
 * Cadeiras do estudante no regime de créditos (ensino superior). Não aparece
 * em escolas sem plano curricular por cadeira.
 */
export function CourseUnitsSection({
  studentId,
  canEdit,
}: {
  studentId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [programId, setProgramId] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [grading, setGrading] = useState<string | null>(null);
  const fetchUnits = useServerFn(getStudentCourseUnits);
  const enroll = useServerFn(enrollCourseUnits);
  const cancel = useServerFn(cancelCourseUnitEnrollment);
  const queryKey = ["academic", "course-units", studentId, programId ?? "auto"];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchUnits({ data: { studentId, programId } }) as Promise<StudentCourseUnits>,
    staleTime: 30_000,
    retry: false,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["academic", "course-units", studentId] });

  const enrollMutation = useMutation({
    mutationFn: () =>
      enroll({
        data: { studentId, programId: query.data!.programId!, programSubjectIds: selected },
      }),
    onSuccess: async (result) => {
      setSelected([]);
      await refresh();
      toast.success(`Inscrito em ${result.enrolled} cadeira(s).`);
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const cancelMutation = useMutation({
    mutationFn: (enrollmentId: string) => cancel({ data: { enrollmentId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Inscrição anulada.");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const data = query.data;
  if (!data?.available) return null;

  const bySemester = new Map<number, CourseUnitRow[]>();
  for (const unit of data.units) {
    bySemester.set(unit.semester, [...(bySemester.get(unit.semester) ?? []), unit]);
  }
  const selectedCredits = data.units
    .filter((u) => selected.includes(u.programSubjectId))
    .reduce((total, u) => total + u.credits, 0);
  const progress = data.progress;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BookOpen className="size-4 text-primary" />
          <h2 className="font-display text-base font-bold">Cadeiras e créditos</h2>
        </div>
        {data.programs.length > 1 ? (
          <select
            aria-label="Curso"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={data.programId ?? ""}
            onChange={(event) => {
              setSelected([]);
              setProgramId(event.target.value);
            }}
          >
            {data.programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground">{data.programs[0]?.name}</span>
        )}
      </div>

      {progress ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Créditos obtidos"
            value={`${progress.earned} de ${progress.planCredits} ECTS`}
          />
          <Stat
            label={`${data.curricularYear}.º ano · ${data.academicYear?.name ?? ""}`}
            value={`${progress.enrolledThisYear} ECTS inscritos (máx. ${data.regulation.maxCreditsPerYear})`}
          />
          <Stat
            label="Para transitar"
            value={
              progress.progression.advances
                ? `Transita (${progress.progression.earned} ECTS)`
                : `${progress.progression.earned} de ${progress.progression.required} ECTS`
            }
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Sem ano lectivo activo: crie-o para inscrever o estudante.
        </p>
      )}

      <div className="mt-5 space-y-4">
        {[...bySemester.entries()]
          .sort(([a], [b]) => a - b)
          .map(([semester, units]) => (
            <div key={semester} className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{semester}.º semestre</p>
              <ul className="divide-y rounded-lg border">
                {units.map((unit) => (
                  <UnitLine
                    key={unit.programSubjectId}
                    unit={unit}
                    units={data.units}
                    canEdit={canEdit && Boolean(data.academicYear)}
                    selected={selected.includes(unit.programSubjectId)}
                    onToggle={() =>
                      setSelected((list) =>
                        list.includes(unit.programSubjectId)
                          ? list.filter((id) => id !== unit.programSubjectId)
                          : [...list, unit.programSubjectId],
                      )
                    }
                    grading={grading === unit.enrollment?.id}
                    onGrade={() => setGrading(unit.enrollment?.id ?? null)}
                    onCloseGrade={() => setGrading(null)}
                    onCancel={() => unit.enrollment && cancelMutation.mutate(unit.enrollment.id)}
                    onSaved={refresh}
                  />
                ))}
              </ul>
            </div>
          ))}
      </div>

      {canEdit && selected.length ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {selected.length} cadeira(s) · {selectedCredits} ECTS
          </p>
          <Button
            type="button"
            disabled={enrollMutation.isPending}
            onClick={() => enrollMutation.mutate()}
          >
            {enrollMutation.isPending ? "A inscrever…" : "Inscrever"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function UnitLine({
  unit,
  units,
  canEdit,
  selected,
  onToggle,
  grading,
  onGrade,
  onCloseGrade,
  onCancel,
  onSaved,
}: {
  unit: CourseUnitRow;
  units: CourseUnitRow[];
  canEdit: boolean;
  selected: boolean;
  onToggle: () => void;
  grading: boolean;
  onGrade: () => void;
  onCloseGrade: () => void;
  onCancel: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { situation, enrollment } = unit;
  const nameOf = (id: string) => units.find((u) => u.programSubjectId === id)?.subjectName ?? "—";

  let detail: string;
  if (situation.kind === "aprovada") {
    detail = situation.grade != null ? `Aprovada com ${situation.grade}` : "Aprovada";
  } else if (situation.kind === "bloqueada") {
    detail = `Exige: ${situation.missing.map(nameOf).join(", ")}`;
  } else if (situation.kind === "inscrita" && enrollment) {
    detail = `${COURSE_UNIT_STATUS_LABELS[enrollment.status]}${
      enrollment.finalGrade != null ? ` · ${enrollment.finalGrade} valores` : ""
    }${enrollment.attempt > 1 ? ` · ${enrollment.attempt}.ª vez` : ""}`;
  } else if (situation.kind === "disponivel") {
    detail = [
      situation.lateUnit ? "Em atraso" : "Disponível",
      situation.attempt > 1 ? `${situation.attempt}.ª vez` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  } else {
    detail = "";
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {situation.kind === "disponivel" && canEdit ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={`Inscrever em ${unit.subjectName}`}
            onClick={onToggle}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded border",
              selected && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {selected ? <Check className="size-3" /> : null}
          </button>
        ) : situation.kind === "aprovada" ? (
          <Check className="size-4 shrink-0 text-primary" />
        ) : situation.kind === "bloqueada" ? (
          <Lock className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="size-4 shrink-0 rounded-full border border-primary/60" />
        )}
        <span className="min-w-0 flex-1 basis-40">
          <span className="block text-sm">{unit.subjectName}</span>
          <span className="block text-xs text-muted-foreground">{detail}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{unit.credits} ECTS</span>
        {canEdit && enrollment ? (
          <span className="ml-auto flex shrink-0 gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={onGrade}>
              Notas
            </Button>
            {enrollment?.status === "inscrito" ? (
              <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                Anular
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
      {grading && enrollment ? (
        <GradeForm enrollmentId={enrollment.id} onClose={onCloseGrade} onSaved={onSaved} />
      ) : null}
    </li>
  );
}

const GRADE_FIELDS = [
  { key: "continuous", label: "Frequência" },
  { key: "absencePercentage", label: "Faltas (%)" },
  { key: "normalExam", label: "Exame normal" },
  { key: "appealExam", label: "Recurso" },
  { key: "specialExam", label: "Especial" },
] as const;

function GradeForm({
  enrollmentId,
  onClose,
  onSaved,
}: {
  enrollmentId: string;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const record = useServerFn(recordCourseUnitGrades);
  const [values, setValues] = useState<Record<string, string>>({});
  const parse = (text: string | undefined) => {
    const clean = (text ?? "").trim().replace(",", ".");
    return clean === "" ? null : Number(clean);
  };
  const mutation = useMutation({
    mutationFn: () =>
      record({
        data: {
          enrollmentId,
          continuous: parse(values["continuous"]),
          absencePercentage: parse(values["absencePercentage"]),
          normalExam: parse(values["normalExam"]),
          appealExam: parse(values["appealExam"]),
          specialExam: parse(values["specialExam"]),
        },
      }),
    onSuccess: async (result) => {
      await onSaved();
      onClose();
      toast.success(
        `Resultado: ${COURSE_UNIT_STATUS_LABELS[result.status]}${
          result.final_grade != null ? ` (${result.final_grade})` : ""
        }.`,
      );
    },
    onError: (error) => toast.error(errorText(error)),
  });
  const invalid = GRADE_FIELDS.some((field) => {
    const value = parse(values[field.key]);
    if (value == null) return false;
    const max = field.key === "absencePercentage" ? 100 : 20;
    return !Number.isFinite(value) || value < 0 || value > max;
  });

  return (
    <div className="mt-3 rounded-lg bg-muted/40 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {GRADE_FIELDS.map((field) => (
          <label key={field.key} className="space-y-1">
            <span className="text-xs text-muted-foreground">{field.label}</span>
            <Input
              inputMode="decimal"
              value={values[field.key] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        O resultado segue o regulamento: dispensa, exclusão, épocas e créditos.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "A gravar…" : "Gravar resultado"}
        </Button>
      </div>
    </div>
  );
}
